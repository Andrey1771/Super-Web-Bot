using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Demo;

namespace SuperBot.WebApi.Demo;

public sealed record DemoSandboxInfo(string Id, DateTime CreatedAt, DateTime ExpiresAt);

public enum DemoSandboxRefusal { None, Full, IpLimit }

/// <summary>
/// Песочницы демо: копия базы-шаблона на сутки для одного посетителя.
///
/// Шаблон — обычная база сайта (ConnectionStrings:Name), её и видит посетитель без песочницы. Копия делается
/// на сервере Mongo ($out в другую базу) вместе с индексами — для демо-каталога это пара секунд. Журнал
/// песочниц лежит в самом шаблоне (DemoSandboxes) и в копии не попадает.
/// </summary>
public sealed class DemoSandboxService
{
    public const string RegistryCollection = "DemoSandboxes";

    /// <summary>Предзаказы шаблона: id игры и через сколько дней от «сегодня» она выходит (см. build-demo-db.js).</summary>
    public const string UpcomingCollection = "DemoUpcoming";

    public const string MailboxCollection = "DemoMailbox";

    /// <summary>
    /// Платёж Stripe → песочница, где он создан. Вебхуки о возвратах и спорах приходят с объектом Charge или Dispute,
    /// на которых метаданных платежа может не быть, — песочницу находим по id платежа.
    /// </summary>
    public const string PaymentsCollection = "DemoPayments";

    /// <summary>Чего в копии быть не должно: журнал песочниц, служебное Hangfire, почта шаблона.</summary>
    private static bool Copyable(string collection) =>
        !collection.StartsWith("system.", StringComparison.Ordinal)
        && !collection.StartsWith("hangfire.", StringComparison.Ordinal)
        && collection is not (RegistryCollection or MailboxCollection or PaymentsCollection);

    private readonly IMongoClient _client;
    private readonly DemoOptions _options;
    private readonly string _templateName;
    private readonly string _uploadsRoot;
    private readonly ILogger<DemoSandboxService> _logger;

    /// <summary>Создание и сброс — по одному за раз: копии делят один маленький сервер.</summary>
    private static readonly SemaphoreSlim CopyGate = new(1, 1);

    public DemoSandboxService(IMongoClient client, IOptions<DemoOptions> options, IConfiguration configuration,
        IWebHostEnvironment environment, ILogger<DemoSandboxService> logger)
    {
        _client = client;
        _options = options.Value;
        _templateName = configuration["ConnectionStrings:Name"] ?? throw new InvalidOperationException("ConnectionStrings:Name is not set.");
        _uploadsRoot = configuration["Uploads:Root"] is { Length: > 0 } root
            ? root
            : Path.Combine(environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot"), "uploads");
        _logger = logger;
    }

    public string DatabaseName(string id) => _options.SandboxDatabasePrefix + id;

    private IMongoDatabase Template => _client.GetDatabase(_templateName);

    private IMongoCollection<BsonDocument> Registry => Template.GetCollection<BsonDocument>(RegistryCollection);

    private static FilterDefinition<BsonDocument> IsSpare => Builders<BsonDocument>.Filter.Eq("status", "spare");

    /// <summary>Живая песочница посетителя по id; null — нет такой, истекла или это ещё не выданная запасная.</summary>
    public async Task<DemoSandboxInfo?> FindAsync(string id, CancellationToken ct)
    {
        if (!DemoSandbox.IsValidId(id))
        {
            return null;
        }
        var doc = await Registry.Find(Builders<BsonDocument>.Filter.Eq("_id", id)).FirstOrDefaultAsync(ct);
        if (doc is null || doc.GetValue("status", "active") == "spare")
        {
            return null;
        }
        var info = ToInfo(doc);
        return info.ExpiresAt > DateTime.UtcNow ? info : null;
    }

    public async Task<(DemoSandboxInfo? Sandbox, DemoSandboxRefusal Refusal)> CreateAsync(string? clientIp, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var ipHash = HashIp(clientIp);
        var active = await Registry.CountDocumentsAsync(
            Builders<BsonDocument>.Filter.Gt("expiresAt", now) & Builders<BsonDocument>.Filter.Not(IsSpare), cancellationToken: ct);
        if (active >= _options.MaxSandboxes)
        {
            return (null, DemoSandboxRefusal.Full);
        }
        var fromIp = await Registry.CountDocumentsAsync(
            Builders<BsonDocument>.Filter.Eq("ipHash", ipHash) & Builders<BsonDocument>.Filter.Gt("createdAt", now.AddDays(-1)),
            cancellationToken: ct);
        if (fromIp >= _options.MaxSandboxesPerIpPerDay)
        {
            return (null, DemoSandboxRefusal.IpLimit);
        }

        var info = await ClaimSpareAsync(ipHash, now, ct) ?? await CreateFreshAsync(ipHash, now, ct);
        RequestRefill();
        _logger.LogInformation("Demo sandbox {Sandbox} opened, {Active} active.", info.Id, active + 1);
        return (info, DemoSandboxRefusal.None);
    }

    /// <summary>
    /// «Начать заново»: посетитель получает другую, свежую копию шаблона на полные сутки, старая удаляется.
    /// Id меняется (cookie перезаписывает контроллер), а в лимите адреса это та же песочница — время создания прежнее.
    /// </summary>
    public async Task<DemoSandboxInfo?> ResetAsync(string id, CancellationToken ct)
    {
        if (await FindAsync(id, ct) is not { } current)
        {
            return null;
        }
        var doc = await Registry.Find(Builders<BsonDocument>.Filter.Eq("_id", id)).FirstOrDefaultAsync(ct);
        var ipHash = doc is not null && doc.TryGetValue("ipHash", out var hash) && hash.IsString ? hash.AsString : HashIp(null);
        var info = await ClaimSpareAsync(ipHash, current.CreatedAt, ct) ?? await CreateFreshAsync(ipHash, current.CreatedAt, ct);
        await DeleteAsync(id, ct);
        RequestRefill();
        return info;
    }

    /// <summary>
    /// Готовая запасная копия — без ожидания: копирование шаблона на маленьком сервере идёт секунды, а запасные
    /// собираются заранее в фоне (<see cref="RefillSparesAsync"/>). Даты предзаказов — от сегодняшнего дня.
    /// </summary>
    private async Task<DemoSandboxInfo?> ClaimSpareAsync(string ipHash, DateTime createdAt, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var claimed = await Registry.FindOneAndUpdateAsync(
            IsSpare & Builders<BsonDocument>.Filter.Gt("expiresAt", now),
            Builders<BsonDocument>.Update
                .Set("status", "active")
                .Set("createdAt", createdAt)
                .Set("claimedAt", now)
                .Set("expiresAt", now.AddHours(_options.SandboxHours))
                .Set("ipHash", ipHash),
            new FindOneAndUpdateOptions<BsonDocument>
            {
                ReturnDocument = ReturnDocument.After,
                Sort = Builders<BsonDocument>.Sort.Ascending("builtAt"),
            }, ct);
        if (claimed is null)
        {
            return null;
        }
        await ShiftUpcomingAsync(_client.GetDatabase(DatabaseName(claimed["_id"].AsString)), ct);
        return ToInfo(claimed);
    }

    private async Task<DemoSandboxInfo> CreateFreshAsync(string ipHash, DateTime createdAt, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var id = DemoSandbox.NewId();
        var doc = new BsonDocument
        {
            { "_id", id },
            { "db", DatabaseName(id) },
            { "status", "active" },
            { "createdAt", createdAt },
            { "claimedAt", now },
            { "builtAt", now },
            { "expiresAt", now.AddHours(_options.SandboxHours) },
            { "ipHash", ipHash },
        };
        await BuildAsync(doc, ct);
        return ToInfo(doc);
    }

    /// <summary>Добрать запасные копии до нужного числа. Зовёт фоновая служба — и сразу после выдачи копии.</summary>
    public async Task<int> RefillSparesAsync(CancellationToken ct, int? target = null)
    {
        var wanted = target ?? _options.SpareSandboxes;
        var now = DateTime.UtcNow;
        var have = await Registry.CountDocumentsAsync(IsSpare & Builders<BsonDocument>.Filter.Gt("expiresAt", now), cancellationToken: ct);
        var built = 0;
        for (var i = have; i < wanted; i++)
        {
            var id = DemoSandbox.NewId();
            await BuildAsync(new BsonDocument
            {
                { "_id", id },
                { "db", DatabaseName(id) },
                { "status", "spare" },
                { "createdAt", now },
                { "builtAt", now },
                // Невыданная запасная пересобирается: шаблон мог обновиться.
                { "expiresAt", now.AddDays(_options.SpareMaxAgeDays) },
            }, ct);
            built++;
        }
        return built;
    }

    /// <summary>Сначала запись в журнал, потом копия: уборка сносит базы без записи, и копия посреди создания иначе выглядела бы брошенной.</summary>
    private async Task BuildAsync(BsonDocument registryEntry, CancellationToken ct)
    {
        var id = registryEntry["_id"].AsString;
        await Registry.InsertOneAsync(registryEntry, cancellationToken: ct);
        try
        {
            await CopyTemplateAsync(id, ct);
        }
        catch
        {
            await DeleteAsync(id, CancellationToken.None);
            throw;
        }
    }

    /// <summary>Сигнал фоновой службе: запасную только что выдали, пора собрать новую.</summary>
    public SemaphoreSlim RefillRequested { get; } = new(0, 1);

    private void RequestRefill()
    {
        if (_options.SpareSandboxes <= 0 || RefillRequested.CurrentCount > 0)
        {
            return;
        }
        try
        {
            RefillRequested.Release();
        }
        catch (SemaphoreFullException)
        {
            // Уже попросили — и ладно.
        }
    }

    private IMongoCollection<BsonDocument> Payments => Template.GetCollection<BsonDocument>(PaymentsCollection);

    public Task RememberPaymentAsync(string paymentIntentId, string sandboxId, CancellationToken ct) =>
        Payments.ReplaceOneAsync(
            Builders<BsonDocument>.Filter.Eq("_id", paymentIntentId),
            new BsonDocument { { "_id", paymentIntentId }, { "sandbox", sandboxId }, { "createdAt", DateTime.UtcNow } },
            new ReplaceOptions { IsUpsert = true }, ct);

    public async Task<string?> FindPaymentSandboxAsync(string paymentIntentId, CancellationToken ct)
    {
        var doc = await Payments.Find(Builders<BsonDocument>.Filter.Eq("_id", paymentIntentId)).FirstOrDefaultAsync(ct);
        return doc?["sandbox"].AsString;
    }

    public async Task DeleteAsync(string id, CancellationToken ct)
    {
        if (!DemoSandbox.IsValidId(id))
        {
            return;
        }
        await DeleteUploadedFilesAsync(id, ct);
        await _client.DropDatabaseAsync(DatabaseName(id), ct);
        await Payments.DeleteManyAsync(Builders<BsonDocument>.Filter.Eq("sandbox", id), ct);
        await Registry.DeleteOneAsync(Builders<BsonDocument>.Filter.Eq("_id", id), ct);
        _logger.LogInformation("Demo sandbox {Sandbox} deleted.", id);
    }

    /// <summary>Истёкшие песочницы и брошенные копии (база есть, записи нет — например, упали посреди создания).</summary>
    public async Task<int> CleanupAsync(CancellationToken ct)
    {
        var removed = 0;
        var expired = await Registry.Find(Builders<BsonDocument>.Filter.Lte("expiresAt", DateTime.UtcNow)).ToListAsync(ct);
        foreach (var doc in expired)
        {
            await DeleteAsync(doc["_id"].AsString, ct);
            removed++;
        }

        var known = (await Registry.Find(FilterDefinition<BsonDocument>.Empty).Project(Builders<BsonDocument>.Projection.Include("_id")).ToListAsync(ct))
            .Select(d => DatabaseName(d["_id"].AsString)).ToHashSet(StringComparer.Ordinal);
        var databases = await (await _client.ListDatabaseNamesAsync(ct)).ToListAsync(ct);
        foreach (var name in databases.Where(n => n.StartsWith(_options.SandboxDatabasePrefix, StringComparison.Ordinal) && !known.Contains(n)))
        {
            var id = name[_options.SandboxDatabasePrefix.Length..];
            if (!DemoSandbox.IsValidId(id))
            {
                continue;
            }
            await DeleteUploadedFilesAsync(id, ct);
            await _client.DropDatabaseAsync(name, ct);
            removed++;
        }
        return removed;
    }

    private async Task CopyTemplateAsync(string id, CancellationToken ct)
    {
        await CopyGate.WaitAsync(ct);
        try
        {
            var targetName = DatabaseName(id);
            await _client.DropDatabaseAsync(targetName, ct);
            var target = _client.GetDatabase(targetName);
            var names = await (await Template.ListCollectionNamesAsync(cancellationToken: ct)).ToListAsync(ct);
            // Коллекций около восьмидесяти: копии данных идут параллельно (по восемь, чтобы не душить маленький сервер).
            await Parallel.ForEachAsync(names.Where(Copyable), new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
                async (name, token) => await CopyCollectionAsync(target, targetName, name, token));
            await ShiftUpcomingAsync(target, ct);
        }
        finally
        {
            CopyGate.Release();
        }
    }

    private async Task CopyCollectionAsync(IMongoDatabase target, string targetName, string name, CancellationToken ct)
    {
        var source = Template.GetCollection<BsonDocument>(name);

        // Коллекцию отдельно не создаём: её создаёт createIndexes или $out, а пустую без индексов Mongo заведёт
        // сам при первой записи. Создание коллекции — операция над всей базой, на реплике ~50 мс и не параллелится.
        // Индексы — до данных: $out сохраняет индексы существующей коллекции.
        var indexes = (await (await source.Indexes.ListAsync(ct)).ToListAsync(ct))
            .Where(ix => ix["name"].AsString != "_id_")
            .Select(ix => { ix.Remove("v"); ix.Remove("ns"); return ix; })
            .ToList();
        if (indexes.Count > 0)
        {
            await target.RunCommandAsync<BsonDocument>(new BsonDocument
            {
                { "createIndexes", name },
                { "indexes", new BsonArray(indexes) },
            }, cancellationToken: ct);
        }

        if (await source.EstimatedDocumentCountAsync(cancellationToken: ct) > 0)
        {
            var pipeline = new BsonDocument[]
            {
                new("$match", new BsonDocument()),
                new("$out", new BsonDocument { { "db", targetName }, { "coll", name } }),
            };
            await source.AggregateToCollectionAsync<BsonDocument>(pipeline, cancellationToken: ct);
        }
    }

    /// <summary>
    /// Шаблон смотрят посетители без своей копии: его предзаказы тоже держим «скоро» — фоновая служба зовёт это
    /// раз в круг (до четырёх обновлений, когда даты уже сегодняшние — ни одного изменения по сути).
    /// </summary>
    public Task ShiftTemplateUpcomingAsync(CancellationToken ct) => ShiftUpcomingAsync(Template, ct);

    /// <summary>«Скоро выйдет» остаётся скоро: даты предзаказов — от сегодняшнего дня, а не от сборки шаблона.</summary>
    private async Task ShiftUpcomingAsync(IMongoDatabase target, CancellationToken ct)
    {
        var upcoming = await Template.GetCollection<BsonDocument>(UpcomingCollection)
            .Find(FilterDefinition<BsonDocument>.Empty).ToListAsync(ct);
        foreach (var item in upcoming)
        {
            var gameId = item["gameId"].AsString;
            var date = DateTime.UtcNow.Date.AddDays(item["offsetDays"].ToInt32());
            await target.GetCollection<BsonDocument>("Games").UpdateOneAsync(
                Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(gameId)),
                Builders<BsonDocument>.Update.Set("releaseDate", date), cancellationToken: ct);
            await target.GetCollection<BsonDocument>("GameDetails").UpdateOneAsync(
                Builders<BsonDocument>.Filter.Eq("gameId", gameId),
                Builders<BsonDocument>.Update.Set("releaseDate", date), cancellationToken: ct);
        }
    }

    /// <summary>
    /// Файлы, загруженные в песочнице (медиатека админки): в шаблоне таких адресов нет. Файлы шаблона общие для
    /// всех копий — их не трогаем никогда.
    /// </summary>
    private async Task DeleteUploadedFilesAsync(string id, CancellationToken ct)
    {
        var templateUrls = (await Template.GetCollection<BsonDocument>("MediaAssets")
                .Find(FilterDefinition<BsonDocument>.Empty).Project(Builders<BsonDocument>.Projection.Include("url").Include("thumbnailUrl")).ToListAsync(ct))
            .SelectMany(UrlsOf).ToHashSet(StringComparer.Ordinal);
        var sandboxAssets = await _client.GetDatabase(DatabaseName(id)).GetCollection<BsonDocument>("MediaAssets")
            .Find(FilterDefinition<BsonDocument>.Empty).Project(Builders<BsonDocument>.Projection.Include("url").Include("thumbnailUrl")).ToListAsync(ct);
        var root = Path.GetFullPath(_uploadsRoot);
        foreach (var url in sandboxAssets.SelectMany(UrlsOf).Where(u => !templateUrls.Contains(u)))
        {
            var relative = url.StartsWith("/uploads/", StringComparison.Ordinal) ? url["/uploads/".Length..] : null;
            if (relative is null || relative.Contains(".."))
            {
                continue;
            }
            var path = Path.GetFullPath(Path.Combine(root, relative));
            if (!path.StartsWith(root, StringComparison.Ordinal))
            {
                continue;
            }
            try
            {
                File.Delete(path);
            }
            catch (IOException ex)
            {
                _logger.LogWarning(ex, "Could not delete sandbox upload {Path}.", path);
            }
        }
    }

    private static IEnumerable<string> UrlsOf(BsonDocument doc)
    {
        foreach (var field in new[] { "url", "thumbnailUrl" })
        {
            if (doc.TryGetValue(field, out var value) && value.IsString && value.AsString.Length > 0)
            {
                yield return value.AsString;
            }
        }
    }

    private static DemoSandboxInfo ToInfo(BsonDocument doc) =>
        new(doc["_id"].AsString, doc["createdAt"].ToUniversalTime(), doc["expiresAt"].ToUniversalTime());

    /// <summary>Адрес посетителя в журнале не хранится — только хеш, чтобы считать лимит.</summary>
    private static string HashIp(string? ip) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("taleshop-demo:" + (ip ?? "unknown"))))[..32];
}
