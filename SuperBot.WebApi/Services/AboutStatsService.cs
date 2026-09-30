using Microsoft.Extensions.Caching.Memory;
using MongoDB.Bson;
using MongoDB.Driver;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Цифры для страницы «О нас»: сколько игр в каталоге, сколько ключей выдано, из скольких
/// стран покупали и как быстро отвечает поддержка.
///
/// До этого все четыре были вписаны в разметку руками («5,000+ Games curated», «40+ Countries
/// served», «50k+ Keys delivered») и расходились с действительностью на два порядка. Число на
/// витрине — это утверждение о факте, и считать его должен тот, у кого факты есть.
///
/// Считаем агрегатами на стороне базы, а не выгрузкой в память: заказы и ключи растут без
/// ограничений, и тянуть их ради четырёх чисел нельзя. Результат кэшируется — страница
/// открывается часто, а цифры меняются медленно.
/// </summary>
public sealed class AboutStatsService
{
    public const string CacheKey = "about:stats";

    /// <summary>
    /// Десять минут. Компромисс между «цифры живые» и «каждый заход не гоняет четыре агрегата»:
    /// свежесть тут никому не нужна с точностью до минуты.
    /// </summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

    private readonly IMongoDatabase _database;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _configuration;
    private readonly SuperBot.Core.Regions.IRegionCatalogProvider _regions;
    private readonly ILogger<AboutStatsService> _logger;

    public AboutStatsService(
        IMongoDatabase database,
        IMemoryCache cache,
        IConfiguration configuration,
        SuperBot.Core.Regions.IRegionCatalogProvider regions,
        ILogger<AboutStatsService> logger)
    {
        _database = database;
        _cache = cache;
        _configuration = configuration;
        _regions = regions;
        _logger = logger;
    }

    public async Task<AboutStatsDto> GetAsync(CancellationToken ct = default)
    {
        var cached = await _cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            return await BuildAsync(ct);
        });

        return cached ?? AboutStatsDto.Empty;
    }

    private async Task<AboutStatsDto> BuildAsync(CancellationToken ct)
    {
        try
        {
            var games = await _database.GetCollection<BsonDocument>("Games").CountDocumentsAsync(
                Builders<BsonDocument>.Filter.Empty, cancellationToken: ct);

            var (keys, countries) = await OrdersFactsAsync(ct);
            var support = await SupportResponseAsync(ct);
            var genres = await GenresAsync(ct);

            return new AboutStatsDto
            {
                FoundedYear = FoundedYear(),
                GamesInCatalog = (int)games,
                GenresInCatalog = genres,
                // Сколько регионов активации магазин поддерживает. Это про возможности, а не
                // про масштаб: число не зависит от того, сколько уже продано.
                ActivationRegions = _regions.Current.Regions.Count,
                KeysDelivered = keys,
                CountriesServed = countries,
                SupportMedianMinutes = support.MedianMinutes,
                SupportSampleSize = support.SampleSize,
            };
        }
        catch (Exception ex)
        {
            // Витрина не должна падать из-за счётчиков: страница про магазин важнее цифр на ней.
            // Пустая сводка читается фронтом как «показывать нечего», и плитки просто не рисуются.
            _logger.LogWarning(ex, "About page statistics could not be computed.");
            return AboutStatsDto.Empty;
        }
    }

    /// <summary>
    /// Год основания посчитать неоткуда — его знает только владелец. Пусто, пока не задан:
    /// выдумывать дату основания магазина нельзя, а «2020» в разметке именно этим и было.
    /// </summary>
    private int? FoundedYear()
    {
        var raw = _configuration["About:FoundedYear"];
        if (int.TryParse(raw, out var year) && year >= 1990 && year <= DateTime.UtcNow.Year)
        {
            return year;
        }
        return null;
    }

    /// <summary>
    /// Сколько разных жанров в каталоге. Считается по тем же значениям, что стоят в фильтрах
    /// каталога, — посетитель может пересчитать сам, открыв список жанров.
    /// </summary>
    private async Task<int> GenresAsync(CancellationToken ct)
    {
        var games = _database.GetCollection<BsonDocument>("Games");
        var values = await games.DistinctAsync<BsonValue>("gameType", Builders<BsonDocument>.Filter.Empty, cancellationToken: ct);
        var list = await values.ToListAsync(ct);
        return list.Count(value => value is not null && !value.IsBsonNull);
    }

    /// <summary>
    /// Выданные ключи и страны покупателей — одним проходом по оплаченным заказам.
    ///
    /// Ключи считаем по фактически выданным (Delivery.Keys), а не по числу позиций: позиция
    /// без ключа — это ожидание поставки, и обещать по ней «доставлено» нельзя.
    /// </summary>
    private async Task<(int Keys, int Countries)> OrdersFactsAsync(CancellationToken ct)
    {
        var orders = _database.GetCollection<BsonDocument>("Orders");

        var pipeline = new[]
        {
            new BsonDocument("$match", new BsonDocument("IsPaid", true)),
            new BsonDocument("$project", new BsonDocument
            {
                { "BuyerCountry", 1 },
                {
                    "Keys", new BsonDocument("$sum", new BsonDocument("$map", new BsonDocument
                    {
                        { "input", new BsonDocument("$ifNull", new BsonArray { "$Items", new BsonArray() }) },
                        { "as", "item" },
                        {
                            "in", new BsonDocument("$size", new BsonDocument("$ifNull",
                                new BsonArray { "$$item.Delivery.Keys", new BsonArray() }))
                        }
                    }))
                }
            }),
            new BsonDocument("$group", new BsonDocument
            {
                { "_id", BsonNull.Value },
                { "keys", new BsonDocument("$sum", "$Keys") },
                { "countries", new BsonDocument("$addToSet", "$BuyerCountry") }
            })
        };

        var row = await orders.Aggregate<BsonDocument>(pipeline, cancellationToken: ct).FirstOrDefaultAsync(ct);
        if (row is null)
        {
            return (0, 0);
        }

        var keys = row.GetValue("keys", 0).ToInt32();
        var countries = row.GetValue("countries", new BsonArray()).AsBsonArray
            .Where(value => value.IsString && !string.IsNullOrWhiteSpace(value.AsString))
            .Select(value => value.AsString.Trim().ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .Count();

        return (keys, countries);
    }

    /// <summary>
    /// Медиана времени до ПЕРВОГО ответа человека, а не среднее.
    ///
    /// Среднее здесь врёт в обе стороны: один тикет, забытый на выходные, поднимает его на
    /// часы, и «среднее время ответа» перестаёт описывать то, что увидит обратившийся.
    /// Медиана отвечает на настоящий вопрос — «сколько ждёт обычный человек».
    /// </summary>
    private async Task<(int? MedianMinutes, int SampleSize)> SupportResponseAsync(CancellationToken ct)
    {
        var messages = _database.GetCollection<BsonDocument>("SupportMessages");

        var pipeline = new[]
        {
            new BsonDocument("$sort", new BsonDocument("createdAt", 1)),
            // В базе роли записаны как "User", "Support", "System" — приводим к нижнему
            // регистру, чтобы сравнение не разъехалось, если где-то напишут иначе.
            new BsonDocument("$addFields", new BsonDocument("role",
                new BsonDocument("$toLower", new BsonDocument("$ifNull", new BsonArray { "$authorType", "" })))),
            new BsonDocument("$group", new BsonDocument
            {
                { "_id", "$ticketId" },
                {
                    "firstAsk", new BsonDocument("$min", new BsonDocument("$cond", new BsonArray
                    {
                        new BsonDocument("$eq", new BsonArray { "$role", "user" }),
                        "$createdAt",
                        BsonNull.Value
                    }))
                },
                {
                    "firstReply", new BsonDocument("$min", new BsonDocument("$cond", new BsonArray
                    {
                        // "system" сюда не входит намеренно: автоответ — не ответ человека, и мерить
                        // им скорость поддержки значит обещать то, чего не было.
                        new BsonDocument("$in", new BsonArray { "$role", new BsonArray { "support", "agent", "admin", "staff" } }),
                        "$createdAt",
                        BsonNull.Value
                    }))
                }
            }),
            new BsonDocument("$match", new BsonDocument
            {
                { "firstAsk", new BsonDocument("$ne", BsonNull.Value) },
                { "firstReply", new BsonDocument("$ne", BsonNull.Value) },
                { "$expr", new BsonDocument("$gte", new BsonArray { "$firstReply", "$firstAsk" }) }
            }),
            new BsonDocument("$project", new BsonDocument
            {
                {
                    "minutes", new BsonDocument("$divide", new BsonArray
                    {
                        new BsonDocument("$subtract", new BsonArray { "$firstReply", "$firstAsk" }),
                        60000
                    })
                }
            })
        };

        var rows = await messages.Aggregate<BsonDocument>(pipeline, cancellationToken: ct).ToListAsync(ct);
        var minutes = rows
            .Select(row => row.GetValue("minutes", BsonNull.Value))
            .Where(value => value.IsNumeric)
            .Select(value => value.ToDouble())
            .OrderBy(value => value)
            .ToList();

        if (minutes.Count == 0)
        {
            return (null, 0);
        }

        var middle = minutes.Count / 2;
        var median = minutes.Count % 2 == 1
            ? minutes[middle]
            : (minutes[middle - 1] + minutes[middle]) / 2;

        return ((int)Math.Round(median), minutes.Count);
    }
}

/// <summary>
/// Сырые факты. Решение «показывать или нет» принимает витрина: пороги — вопрос подачи,
/// и держать их рядом с версткой честнее, чем прятать в сервере.
/// </summary>
public sealed class AboutStatsDto
{
    public static readonly AboutStatsDto Empty = new();

    /// <summary>Из конфигурации (About:FoundedYear). null — не задан, плитку не показываем.</summary>
    public int? FoundedYear { get; set; }

    public int GamesInCatalog { get; set; }

    /// <summary>Разных жанров в каталоге — то же, что в фильтрах витрины.</summary>
    public int GenresInCatalog { get; set; }

    /// <summary>Регионов активации в справочнике: про возможности выдачи, а не про объём продаж.</summary>
    public int ActivationRegions { get; set; }

    public int KeysDelivered { get; set; }
    public int CountriesServed { get; set; }

    /// <summary>Медиана времени до первого ответа поддержки, минуты. null — считать не по чему.</summary>
    public int? SupportMedianMinutes { get; set; }

    /// <summary>По скольким обращениям посчитана медиана — витрина по этому решает, показывать ли.</summary>
    public int SupportSampleSize { get; set; }
}
