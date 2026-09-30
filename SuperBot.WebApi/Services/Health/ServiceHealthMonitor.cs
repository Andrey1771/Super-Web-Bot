using System.Text;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Support.Chat;

namespace SuperBot.WebApi.Services.Health;

/// <summary>
/// Фоновый прогон проверок здоровья и письмо владельцу, когда что-то сломалось.
///
/// Главный этап всей затеи. Страница здоровья отвечает на вопрос «что именно сломано», но
/// задаёт его человек, а все наши поломки — мёртвый вебхук, заблокированный Stripe — длились
/// днями именно потому, что вопрос никто не задавал. Поэтому проверки крутятся сами, а
/// переход «работало → сломалось» уезжает почтой.
///
/// Канал намеренно почтовый, а не телеграмный: бот у нас ломается чаще всего остального, и
/// сообщать о его поломке через него же бессмысленно.
///
/// Снимки в базе нужны не только для писем: по ним видно «сломано с такого-то момента», а без
/// этого непонятно, авария сейчас или неделю назад.
/// </summary>
public sealed class ServiceHealthMonitor
{
    public const string CollectionName = "ServiceHealth";

    /// <summary>
    /// Насколько снимок может отстать от самого свежего, оставаясь живым. Прогон идёт раз в несколько минут и обновляет
    /// все проверки разом, так что отставание в час означает проверку, которой в коде больше нет.
    /// </summary>
    private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(1);

    private readonly AdminDashboardService _dashboard;
    private readonly IMongoDatabase _database;
    private readonly IMailSender _mail;
    private readonly MailOptions _mailOptions;
    private readonly SupportChatOptions _chat;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ServiceHealthMonitor> _logger;

    public ServiceHealthMonitor(
        AdminDashboardService dashboard,
        IMongoDatabase database,
        IMailSender mail,
        IOptions<MailOptions> mailOptions,
        IOptions<SupportChatOptions> chat,
        IConfiguration configuration,
        ILogger<ServiceHealthMonitor> logger)
    {
        _dashboard = dashboard;
        _database = database;
        _mail = mail;
        _mailOptions = mailOptions.Value;
        _chat = chat.Value;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Куда писать. Отдельная настройка, но с запасными вариантами: заводить обязательный
    /// параметр ради этого нельзя — тогда проверка молчала бы на любой существующей установке.
    /// </summary>
    private string? AlertRecipient =>
        new[]
        {
            _configuration["Health:AlertEmail"],
            _chat.SpecialistEmail,
            _mailOptions.FromAddress
        }.FirstOrDefault(address => !string.IsNullOrWhiteSpace(address));

    public async Task RunAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var health = await _dashboard.CheckHealthAsync(ct);
        var collection = _database.GetCollection<BsonDocument>(CollectionName);
        var recipient = AlertRecipient;

        foreach (var item in health.Items)
        {
            var previous = await collection
                .Find(Builders<BsonDocument>.Filter.Eq("_id", item.Name))
                .FirstOrDefaultAsync(ct);

            var previousState = previous?.GetValue("state", BsonNull.Value).AsStringOrNull();
            var lastNotified = previous?.GetValue("lastNotifiedAt", BsonNull.Value).ToNullableUtc();
            var since = previousState == item.State
                ? previous?.GetValue("since", BsonNull.Value).ToNullableUtc() ?? now
                : now;

            var action = HealthAlertRules.Decide(previousState, item.State, lastNotified, now);
            var notified = lastNotified;

            if (action != HealthAlertAction.None && !string.IsNullOrWhiteSpace(recipient))
            {
                if (await TrySendAsync(recipient!, action, item, since, now))
                {
                    notified = now;
                }
            }

            // Восстановление обнуляет отметку: следующая поломка должна написать сразу, а не
            // ждать суток от прошлого письма.
            if (action == HealthAlertAction.Recovered)
            {
                notified = null;
            }

            var update = new BsonDocument
            {
                { "state", item.State },
                { "detail", item.Detail ?? string.Empty },
                { "since", since },
                { "updatedAt", now },
                { "lastNotifiedAt", notified.HasValue ? notified.Value : BsonNull.Value }
            };

            await collection.UpdateOneAsync(
                Builders<BsonDocument>.Filter.Eq("_id", item.Name),
                new BsonDocument("$set", update),
                new UpdateOptions { IsUpsert = true },
                ct);
        }
    }

    /// <summary>
    /// Последние снимки — то, что намерил фоновый прогон.
    ///
    /// Страница разбора читает именно их, а не ходит по сервисам заново: открытие страницы
    /// не должно само по себе создавать нагрузку на чужие API, а «когда сломалось» всё равно
    /// знают только снимки.
    /// </summary>
    public async Task<IReadOnlyList<ServiceHealthSnapshotDto>> GetSnapshotsAsync(CancellationToken ct = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(CollectionName)
            .Find(Builders<BsonDocument>.Filter.Empty)
            .ToListAsync(ct);

        // Снимки проверок, которых больше нет в коде (так осталась убранная ЮKassa), не показываем: живые проверки
        // обновляются одним прогоном, и снимок, отставший от самого свежего дольше StaleAfter, — от проверки, которую
        // уже никто не запускает. Из базы его не удаляем: фильтр при чтении дешевле записи в каждом прогоне.
        var newest = documents.Max(document => document.GetValue("updatedAt", BsonNull.Value).ToNullableUtc());
        return documents
            .Where(document => newest is null
                || (document.GetValue("updatedAt", BsonNull.Value).ToNullableUtc() ?? DateTime.MinValue) >= newest.Value - StaleAfter)
            .Select(document => new ServiceHealthSnapshotDto
            {
                Name = document.GetValue("_id", BsonNull.Value).AsStringOrNull() ?? string.Empty,
                State = document.GetValue("state", BsonNull.Value).AsStringOrNull() ?? "unconfigured",
                Detail = document.GetValue("detail", BsonNull.Value).AsStringOrNull(),
                Since = document.GetValue("since", BsonNull.Value).ToNullableUtc(),
                UpdatedAt = document.GetValue("updatedAt", BsonNull.Value).ToNullableUtc()
            })
            .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<bool> TrySendAsync(
        string recipient,
        HealthAlertAction action,
        DashboardHealthItemDto item,
        DateTime since,
        DateTime now)
    {
        var subject = action switch
        {
            HealthAlertAction.Broken => $"Tale Shop: {item.Name} is down",
            HealthAlertAction.Recovered => $"Tale Shop: {item.Name} is back",
            _ => $"Tale Shop: {item.Name} is still down"
        };

        var body = new StringBuilder()
            .AppendLine(action == HealthAlertAction.Recovered
                ? $"{item.Name} answers again."
                : $"{item.Name} is not answering.")
            .AppendLine()
            .AppendLine($"State: {item.State}")
            .AppendLine($"Detail: {item.Detail}")
            .AppendLine($"Since: {since:yyyy-MM-dd HH:mm} UTC ({FormatFor(now - since)})")
            .AppendLine()
            .AppendLine("The shop keeps running — this affects one dependency, not the whole site.")
            .ToString();

        try
        {
            await _mail.SendAsync(recipient, subject, body);
            _logger.LogInformation("Health alert sent: {Check} → {Action}", item.Name, action);
            return true;
        }
        catch (Exception ex)
        {
            // Не смогли написать — не повод ронять прогон и уж тем более не повод помечать
            // поломку как «сообщили»: тогда о ней не узнают вообще никогда.
            _logger.LogError(ex, "Health alert could not be sent for {Check}", item.Name);
            return false;
        }
    }

    private static string FormatFor(TimeSpan span) =>
        span.TotalMinutes < 60 ? $"{(int)span.TotalMinutes} min"
        : span.TotalHours < 48 ? $"{(int)span.TotalHours} h"
        : $"{(int)span.TotalDays} d";
}

/// <summary>Снимок одной проверки: состояние, причина и с какого момента оно держится.</summary>
public sealed class ServiceHealthSnapshotDto
{
    public string Name { get; set; } = string.Empty;
    public string State { get; set; } = "unconfigured";
    public string? Detail { get; set; }
    public DateTime? Since { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

internal static class BsonHealthExtensions
{
    /// <summary>Строка или null: в снимке поля может не быть вовсе.</summary>
    public static string? AsStringOrNull(this BsonValue value) =>
        value is { IsBsonNull: false } && value.IsString ? value.AsString : null;

    public static DateTime? ToNullableUtc(this BsonValue value) =>
        value is { IsBsonNull: false } && value.IsValidDateTime ? value.ToUniversalTime() : null;
}
