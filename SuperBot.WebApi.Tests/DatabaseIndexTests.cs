using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Схема базы: индексы под горячие запросы и сроки хранения.
///
/// Смысл этих тестов не в том, что «индекс создан», а в том, что запросы им ПОЛЬЗУЮТСЯ.
/// Индекс легко сломать незаметно: поменять порядок полей в составном, изменить условие
/// в репозитории, удалить строку в инициализаторе — код соберётся, тесты пройдут,
/// а каталог начнёт сканировать коллекции целиком. Проверка плана выполнения это ловит.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class DatabaseIndexTests
{
    private readonly TaleShopApiFactory _factory;

    public DatabaseIndexTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private IMongoDatabase Database(IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<IMongoDatabase>();

    private async Task<List<BsonDocument>> GetIndexesAsync(string collectionName)
    {
        using var scope = _factory.Services.CreateScope();
        return await Database(scope)
            .GetCollection<BsonDocument>(collectionName)
            .Indexes.List()
            .ToListAsync();
    }

    private static IEnumerable<string> NamesOf(IEnumerable<BsonDocument> indexes) =>
        indexes.Where(index => index.Contains("name")).Select(index => index["name"].AsString);

    /// <summary>
    /// План выполнения запроса. Фильтр принимаем ТИПИЗИРОВАННЫЙ и рендерим через маппинг:
    /// имена полей в базе не совпадают с именами свойств (например, GameDb хранит поля
    /// в camelCase через BsonElement), и фильтр, собранный руками из строк, молча
    /// промахнулся бы мимо индекса.
    ///
    /// План разбираем строкой: структура ответа explain меняется между версиями MongoDB,
    /// а маркеры стадий (IXSCAN/COLLSCAN) — нет.
    /// </summary>
    private async Task<string> ExplainFindAsync<TDocument>(string collectionName, FilterDefinition<TDocument> filter)
    {
        using var scope = _factory.Services.CreateScope();
        var serializerRegistry = MongoDB.Bson.Serialization.BsonSerializer.SerializerRegistry;
        var documentSerializer = serializerRegistry.GetSerializer<TDocument>();
        var renderedFilter = filter.Render(new RenderArgs<TDocument>(documentSerializer, serializerRegistry));

        var command = new BsonDocument
        {
            { "explain", new BsonDocument
                {
                    { "find", collectionName },
                    { "filter", renderedFilter }
                }
            },
            { "verbosity", "queryPlanner" }
        };

        var result = await Database(scope).RunCommandAsync<BsonDocument>(command);
        return result.ToString();
    }

    private static void AssertUsesIndex(string plan, string collectionName)
    {
        Assert.True(
            plan.Contains("IXSCAN"),
            $"Запрос к {collectionName} должен идти по индексу, а план не содержит IXSCAN:\n{plan}");
        Assert.False(
            plan.Contains("COLLSCAN"),
            $"Запрос к {collectionName} сканирует коллекцию целиком:\n{plan}");
    }

    /// <summary>
    /// Наполняет коллекцию, чтобы индекс стал объективно выгоднее полного сканирования:
    /// на двух-трёх документах Mongo обоснованно выбирает COLLSCAN.
    ///
    /// Вставка ТИПИЗИРОВАННАЯ: сырые BsonDocument легко записать с чужими именами полей,
    /// и тогда чтение коллекции падает у всех остальных тестов.
    /// </summary>
    private async Task SeedBulkAsync<TDocument>(string collectionName, Func<int, TDocument> documentFactory, int count = 200)
    {
        using var scope = _factory.Services.CreateScope();
        var collection = Database(scope).GetCollection<TDocument>(collectionName);
        await collection.InsertManyAsync(Enumerable.Range(0, count).Select(documentFactory));
    }

    private async Task<string> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var name = $"Index Probe {Guid.NewGuid():N}";
        await games.CreateAsync(new Game
        {
            Name = name,
            Title = name,
            Slug = $"index-probe-{Guid.NewGuid():N}",
            Price = 10m,
            ReleaseDate = DateTime.UtcNow.AddYears(-1)
        });

        var all = await games.GetAllAsync();
        return all.First(game => game.Name == name).Id!;
    }

    // ---------- индексы существуют ----------

    [Theory]
    [InlineData("GameDiscounts", "ix_game_discounts_game")]
    [InlineData("Games", "ix_games_slug")]
    [InlineData("Users", "ix_users_user_id")]
    [InlineData("MediaAssets", "ix_media_hash_size")]
    [InlineData("Orders", "ix_orders_number")]
    [InlineData("Orders", "ix_orders_paid_at")]
    [InlineData("TarotDrawLocks", "ix_tarot_locks_ttl")]
    public async Task Required_index_is_created_on_startup(string collectionName, string indexName)
    {
        var indexes = await GetIndexesAsync(collectionName);

        Assert.Contains(indexName, NamesOf(indexes));
    }

    // ---------- горячие запросы идут по индексу ----------

    [Fact]
    public async Task Discount_lookup_by_game_uses_index()
    {
        // Самый горячий путь: скидки запрашиваются при каждой загрузке каталога,
        // карточки игры, чарта продаж и баннера недели.
        var gameId = await SeedGameAsync();
        await SeedBulkAsync("GameDiscounts", index => new GameDiscountDb
        {
            GameId = $"probe-discount-{index}",
            DiscountPercent = 10m,
            StartDate = DateTime.UtcNow.AddDays(-1),
            EndDate = DateTime.UtcNow.AddDays(1)
        });

        using (var scope = _factory.Services.CreateScope())
        {
            var discounts = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();
            await discounts.UpsertAsync(new GameDiscount
            {
                GameId = gameId,
                DiscountPercent = 20m,
                StartDate = DateTime.UtcNow.AddDays(-1),
                EndDate = DateTime.UtcNow.AddDays(1)
            });
        }

        var plan = await ExplainFindAsync("GameDiscounts",
            Builders<GameDiscountDb>.Filter.Eq(discount => discount.GameId, gameId));

        AssertUsesIndex(plan, "GameDiscounts");
    }

    [Fact]
    public async Task Game_lookup_by_slug_uses_index()
    {
        // Открытие карточки товара — самое частое действие покупателя.
        await SeedBulkAsync("Games", index => new GameDb
        {
            Name = $"Probe {index}",
            Title = $"Probe {index}",
            Slug = $"probe-slug-{index}",
            Description = "index probe",
            ImagePath = "cover.png",
            Price = 10m,
            ReleaseDate = DateTime.UtcNow.AddYears(-1)
        });

        var plan = await ExplainFindAsync("Games",
            Builders<GameDb>.Filter.Eq(game => game.Slug, "probe-slug-42"));

        AssertUsesIndex(plan, "Games");
    }

    [Fact]
    public async Task Order_lookup_by_number_uses_index()
    {
        // Открытие заказа из кабинета, письма и админки идёт по номеру, а не по _id.
        await SeedBulkAsync("Orders", index => new OrderDb
        {
            OrderNumber = $"TS-PROBE-{index}",
            UserId = "probe-user",
            // Без GameId и позиций: такие заказы не должны попадать в чарт продаж,
            // иначе сломали бы проверки соседних тестов.
            IsPaid = index % 2 == 0,
            PaidAt = DateTime.UtcNow.AddDays(-index),
            OrderDate = DateTime.UtcNow.AddDays(-index)
        });

        var plan = await ExplainFindAsync("Orders",
            Builders<OrderDb>.Filter.Eq(order => order.OrderNumber, "TS-PROBE-42"));

        AssertUsesIndex(plan, "Orders");
    }

    [Fact]
    public async Task Weekly_chart_query_uses_index()
    {
        // Составной индекс IsPaid + PaidAt: равенство первым, диапазон вторым.
        // Если поменять порядок полей местами, этот тест упадёт.
        await SeedBulkAsync("Orders", index => new OrderDb
        {
            OrderNumber = $"TS-CHART-{index}",
            UserId = "probe-user",
            IsPaid = true,
            PaidAt = DateTime.UtcNow.AddDays(-(index % 30)),
            OrderDate = DateTime.UtcNow.AddDays(-(index % 30))
        });

        var filter = Builders<OrderDb>.Filter.And(
            Builders<OrderDb>.Filter.Eq(order => order.IsPaid, true),
            Builders<OrderDb>.Filter.Gte(order => order.PaidAt, DateTime.UtcNow.AddDays(-7)));

        var plan = await ExplainFindAsync("Orders", filter);

        AssertUsesIndex(plan, "Orders");
    }

    // ---------- сроки хранения ----------

    [Theory]
    [InlineData("GameTrackingEvents", "ix_game_tracking_ttl", 90)]
    [InlineData("BlogEvents", "ix_blog_events_ttl", 180)]
    [InlineData("BlogPostUniqueViews", "ix_blog_unique_views_ttl", 180)]
    [InlineData("TelegramLinkTokens", "ix_telegram_link_tokens_ttl", 1)]
    public async Task Retention_index_expires_after_expected_days(string collectionName, string indexName, int expectedDays)
    {
        var indexes = await GetIndexesAsync(collectionName);
        var ttlIndex = indexes.FirstOrDefault(index =>
            index.Contains("name") && index["name"].AsString == indexName);

        Assert.NotNull(ttlIndex);
        Assert.True(ttlIndex!.Contains("expireAfterSeconds"),
            $"{indexName} должен быть TTL-индексом, но срок хранения не задан.");

        var expectedSeconds = TimeSpan.FromDays(expectedDays).TotalSeconds;
        Assert.Equal(expectedSeconds, ttlIndex["expireAfterSeconds"].ToDouble());
    }

    [Fact]
    public async Task Recovery_requests_are_kept_forever_on_purpose()
    {
        // Заявки на восстановление — след действий с чужим аккаунтом, то есть аудит
        // безопасности. TTL здесь появиться не должен: он стёр бы историю попыток.
        var indexes = await GetIndexesAsync("RecoveryRequests");

        Assert.DoesNotContain(indexes, index => index.Contains("expireAfterSeconds"));
    }

    // ---------- карта базы ----------

    [Fact]
    public async Task Declared_collections_exist_after_startup()
    {
        using var scope = _factory.Services.CreateScope();
        var existing = await (await Database(scope).ListCollectionNamesAsync()).ToListAsync();

        // Выборочно, по одной из каждого домена: если инициализатор перестанет отрабатывать,
        // это заметит любая из проверок.
        string[] expected =
        [
            "Games", "GameDiscounts", "MediaAssets",
            "Orders", "PromoCodes",
            "TarotSettings", "DealOfWeekSettings",
            "BlogPosts", "NewsletterSubscribers",
            "SupportTickets", "TelegramLinks", "Settings"
        ];

        foreach (var collectionName in expected)
        {
            Assert.Contains(collectionName, existing);
        }
    }
}
