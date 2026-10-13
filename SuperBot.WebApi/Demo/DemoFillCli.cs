using MongoDB.Bson;
using MongoDB.Driver;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Newsletter;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Второй слой наполнения демо (после <see cref="DemoSeedCli"/>): живая статистика за последние недели во всех разделах
/// админки — заказы зарегистрированных и гостевых покупателей (настоящие тестовые платежи Stripe, как в demo-seed), воронка
/// «просмотр → корзина → оформление → покупка», брошенные корзины, подписчики и рассылки, чаты с ботом и обращения
/// в поддержку, отзывы на модерации, неудачные платежи и расходы на рекламу по каналам.
///
///   docker compose run --rm --no-deps backend demo-fill --print-buyers              — CSV покупателей для Keycloak
///   docker compose run --rm --no-deps -e Mail__DryRun=true backend demo-fill [заказов, 180] [дней, 60] [--force]
///   docker compose run --rm --no-deps backend demo-fill --reset                     — убрать всё, кроме заказов
///
/// Учётки зарегистрированных покупателей заводит deploy/demo/keycloak-demo-buyers.sh (по CSV выше), всё вместе —
/// deploy/demo/fill-demo.sh. Адреса — @example.com: писем никто не получает, демо-админ их видит без маски.
/// Идентификаторы всего, что записано напрямую, лежат в коллекции DemoFill: --reset удаляет их и возвращает отзывам
/// прежний статус. Заказы --reset не трогает: с ними связаны ключи, кэшбэк и промокоды.
/// События воронки старше 90 дней Mongo удаляет сама (TTL), поэтому период — не больше 80 дней.
/// </summary>
public static class DemoFillCli
{
    public const string Command = "demo-fill";
    private const string MarkerCollection = "DemoFill";

    public sealed record Buyer(string FirstName, string LastName, string Email, string Country, DateTime RegisteredAt, bool Registered)
    {
        public string Name => $"{FirstName} {LastName}";
    }

    private static readonly (string First, string Last, string Country)[] People =
    [
        ("James", "Carter", "US"), ("Hannah", "Weber", "DE"), ("George", "Hughes", "GB"), ("Maja", "Wisniewska", "PL"),
        ("Hugo", "Lefevre", "FR"), ("Giulia", "Bianchi", "IT"), ("Logan", "Tremblay", "CA"), ("Lucia", "Fernandez", "ES"),
        ("Benjamin", "Davis", "US"), ("Piotr", "Zielinski", "PL"), ("Ines", "Moreau", "FR"), ("Rafael", "Costa", "BR"),
        ("Charlotte", "King", "AU"), ("Henry", "Anderson", "US"), ("Elsa", "Lindqvist", "SE"), ("Finn", "Becker", "DE"),
        ("Grace", "Turner", "GB"), ("Diego", "Hernandez", "MX"), ("Harper", "Thomas", "US"), ("Tomas", "Dvorak", "CZ"),
        ("Aria", "Nakamura", "JP"), ("Lukas", "Hofer", "AT"), ("Nora", "Jansen", "NL"), ("Emil", "Nielsen", "DK"),
        ("Sara", "Virtanen", "FI"), ("Oscar", "Larsen", "NO"), ("Ella", "Murphy", "IE"), ("Mateus", "Oliveira", "PT"),
        ("Yuki", "Tanaka", "JP"), ("Jack", "Robinson", "US"), ("Lena", "Wagner", "AT"), ("Max", "Vermeulen", "BE"),
        ("Alice", "Bernard", "FR"), ("Anton", "Petrov", "BG"), ("Iris", "de Vries", "NL"), ("Kai", "Schulz", "DE"),
        ("Ruby", "Walsh", "IE"), ("Samuel", "Lee", "US"), ("Klara", "Novotna", "CZ"), ("Victor", "Lindgren", "SE"),
        // Гости — без учётки в Keycloak, покупают по почте.
        ("Ryan", "Cooper", "US"), ("Megan", "Price", "GB"), ("Paul", "Richter", "DE"), ("Adam", "Kaczmarek", "PL"),
        ("Laura", "Romero", "ES"), ("Marco", "Esposito", "IT"), ("Nathan", "Roy", "CA"), ("Bruna", "Santos", "BR"),
        ("Chloe", "Evans", "AU"), ("Eric", "Holm", "SE"), ("Sophie", "Girard", "FR"), ("Daniel", "Kim", "US"),
    ];

    private const int RegisteredCount = 40;

    /// <summary>Откуда пришёл покупатель: источник, канал, кампания и вес (из 100).</summary>
    private static readonly (string Source, string Medium, string? Campaign, int Weight)[] Channels =
    [
        ("google", "organic", null, 26),
        ("google", "cpc", "autumn_sale", 14),
        ("direct", "none", null, 18),
        ("reddit", "social", null, 10),
        ("youtube", "video", "creator_reviews", 9),
        ("newsletter", "email", "weekly_deals", 10),
        ("twitter", "social", null, 5),
        ("discord", "referral", null, 4),
        ("bing", "organic", null, 4),
    ];

    private static readonly string[] Cards = ["pm_card_visa", "pm_card_visa", "pm_card_visa", "pm_card_mastercard", "pm_card_amex"];

    public static IReadOnlyList<Buyer> BuildBuyers(DateTime now)
    {
        var random = new Random(4242);
        return People.Select((person, index) =>
        {
            var email = $"{person.First}.{person.Last}".ToLowerInvariant().Replace(" ", string.Empty) + "@example.com";
            var registered = index < RegisteredCount;
            var registeredAt = now.AddDays(-random.Next(3, 75)).AddMinutes(-random.Next(0, 1440));
            return new Buyer(person.First, person.Last, email, person.Country, registeredAt, registered);
        }).ToList();
    }

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var config = sp.GetRequiredService<IConfiguration>();
        if (!config.GetValue<bool>("Demo:Enabled"))
        {
            Console.Error.WriteLine("demo-fill: Demo:Enabled is false — this is not a demo site, nothing done.");
            return 1;
        }
        var now = DateTime.UtcNow;
        var database = sp.GetRequiredService<IMongoDatabase>();
        var marker = database.GetCollection<BsonDocument>(MarkerCollection);

        if (args.Contains("--print-buyers"))
        {
            foreach (var buyer in BuildBuyers(now).Where(b => b.Registered))
            {
                Console.WriteLine($"{buyer.Email},{buyer.FirstName},{buyer.LastName},{new DateTimeOffset(buyer.RegisteredAt).ToUnixTimeMilliseconds()}");
            }
            return 0;
        }
        if (args.Contains("--reset"))
        {
            return await ResetAsync(database, marker);
        }

        var positional = args.Where(a => !a.StartsWith("--", StringComparison.Ordinal)).ToArray();
        var orderCount = positional.Length > 0 && int.TryParse(positional[0], out var o) && o > 0 ? o : 180;
        var days = positional.Length > 1 && int.TryParse(positional[1], out var d) && d is > 7 and <= 80 ? d : 60;
        if (!args.Contains("--force") && await marker.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty) > 0)
        {
            Console.Error.WriteLine("demo-fill: already filled (collection DemoFill). Use --reset first, or --force to add another round.");
            return 1;
        }
        var stripeKey = config["Stripe:SecretKey"] ?? string.Empty;
        if (!stripeKey.StartsWith("sk_test_", StringComparison.Ordinal))
        {
            Console.Error.WriteLine("demo-fill: Stripe:SecretKey is not a test key — refusing to create payments.");
            return 1;
        }
        StripeConfiguration.ApiKey = stripeKey;

        var random = new Random(2610);
        var from = now.AddDays(-days);
        var buyers = BuildBuyers(now);
        var ids = new Dictionary<string, List<string>>();
        void Track(string collection, string id)
        {
            if (!ids.TryGetValue(collection, out var list))
            {
                ids[collection] = list = new List<string>();
            }
            list.Add(id);
        }

        var catalog = await sp.GetRequiredService<ICatalogSnapshotService>().GetAsync();
        var products = catalog.Where(item => !item.IsComingSoon && item.InStock && item.FinalPrice > 0 && item.ReleaseDate < now).ToList();
        if (products.Count == 0)
        {
            Console.Error.WriteLine("demo-fill: no products in stock.");
            return 1;
        }
        var events = new List<GameTrackingEventDb>();

        // 1. Заказы — тем же путём, что у покупателя (Stripe → касса → финализация), даты потом сдвигаются в прошлое.
        var visitorOf = buyers.ToDictionary(b => b.Email, _ => NewVisitorId(random));
        var buyingRegistered = buyers.Where(b => b.Registered).Take(30).ToList(); // десяти зарегистрированным — без покупок
        var guests = buyers.Where(b => !b.Registered).ToList();
        var orderIds = await SeedOrdersAsync(sp, database, products, buyingRegistered, guests, visitorOf, orderCount, days, now, random, events);
        orderIds.ForEach(id => Track("Orders", id));

        // 2. Старые заказы этого периода (demo-seed) без посетителя: иначе воронка не свяжет покупки с просмотрами
        //    и спрячет проценты. Посетитель + события перед заказом — как у новых.
        await LinkOlderOrdersAsync(database, from, random, events);

        // 3. Посетители без покупок: смотрят, кладут в корзину, бросают на оформлении.
        AddBrowsingVisitors(products, buyers, from, now, orderCount * 5, random, events);
        if (events.Count > 0)
        {
            await database.GetCollection<GameTrackingEventDb>("GameTrackingEvents").InsertManyAsync(events);
            events.ForEach(e => Track("GameTrackingEvents", e.Id));
        }

        await SeedCartsAsync(database, products, buyers.Where(b => b.Registered).Skip(30).ToList(), now, random, Track);
        await SeedNewsletterAsync(database, buyers, from, now, random, Track);
        await SeedChatsAsync(database, buyers, from, now, random, Track);
        await SeedTicketsAsync(database, buyers, from, now, random, Track);
        var reviewStatuses = await SeedModerationAsync(database, now, random);
        await SeedPaymentFailuresAsync(database, buyers, from, now, random, Track);
        await SeedChannelSpendAsync(database, from, now, random, Track);

        foreach (var buyer in buyingRegistered)
        {
            await DemoSeedCli.RefreshCashbackAsync(sp, database, buyer.Email);
        }
        sp.GetRequiredService<ICatalogSnapshotService>().Invalidate();

        var doc = new BsonDocument
        {
            { "filledAt", now },
            { "days", days },
            { "ids", new BsonDocument(ids.Select(pair => new BsonElement(pair.Key, new BsonArray(pair.Value)))) },
            { "reviewStatuses", new BsonDocument(reviewStatuses.Select(pair => new BsonElement(pair.Key, pair.Value))) },
        };
        await marker.InsertOneAsync(doc);
        Console.WriteLine("Demo filled: " + string.Join(", ", ids.Select(pair => $"{pair.Key} {pair.Value.Count}")) + $", reviews to moderation {reviewStatuses.Count}.");
        return 0;
    }

    private static string NewVisitorId(Random random) => "v" + random.NextInt64(0x10_0000_0000, 0xFF_FFFF_FFFF).ToString("x");

    /// <summary>Дата с перекосом к недавним: магазин «растёт».</summary>
    private static DateTime RecentDate(DateTime now, int days, Random random) =>
        now.AddDays(-days * Math.Pow(random.NextDouble(), 1.4)).AddMinutes(-random.Next(0, 600));

    private static async Task<List<string>> SeedOrdersAsync(IServiceProvider sp, IMongoDatabase database, List<CatalogItem> products,
        List<Buyer> registered, List<Buyer> guests, Dictionary<string, string> visitorOf, int orderCount, int days, DateTime now,
        Random random, List<GameTrackingEventDb> events)
    {
        var pricing = sp.GetRequiredService<ICheckoutPricingService>();
        var finalization = sp.GetRequiredService<IOrderFinalizationService>();
        var orders = sp.GetRequiredService<IOrderRepository>();
        var keys = database.GetCollection<GameKeyDb>("GameKeys");
        var cashback = database.GetCollection<CashbackEntryDb>("CashbackEntries");
        var paymentIntents = new PaymentIntentService();
        var promos = new[] { "SPRING15", "GAMER5", "VIP25" };
        var created = new List<string>();
        var failuresInRow = 0;

        var dates = Enumerable.Range(0, orderCount).Select(_ => RecentDate(now, days, random)).OrderBy(date => date).ToList();
        for (var i = 0; i < dates.Count; i++)
        {
            // Постоянные покупатели чаще: первые в списке зарегистрированных покупают больше.
            var buyer = random.NextDouble() < 0.7
                ? registered[(int)(Math.Pow(random.NextDouble(), 1.7) * registered.Count)]
                : guests[random.Next(guests.Count)];
            // Покупка — после регистрации.
            var date = buyer.Registered && dates[i] < buyer.RegisteredAt ? buyer.RegisteredAt.AddHours(random.Next(1, 48)) : dates[i];
            if (date > now)
            {
                date = now.AddMinutes(-random.Next(30, 600));
            }
            var lineCount = random.NextDouble() switch { < 0.62 => 1, < 0.9 => 2, _ => 3 };
            var items = products.OrderBy(_ => random.Next()).Take(lineCount)
                .Select(product => new CheckoutPricingItem { GameId = product.Id, Quantity = 1 }).ToList();
            var promo = random.NextDouble() < 0.2 ? promos[random.Next(promos.Length)] : null;
            var priced = await DemoSeedCli.PriceAsync(pricing, items, promo, buyer.Email, buyer.Country);
            if (priced is null)
            {
                continue;
            }

            var channel = PickChannel(random);
            var metadata = new Dictionary<string, string>
            {
                ["userId"] = buyer.Email,
                ["itemCount"] = priced.Items.Count.ToString(),
                ["firstItemGameId"] = priced.Items[0].GameId ?? string.Empty,
                ["firstItemTitle"] = priced.Items[0].Title,
                ["currency"] = priced.Currency,
                ["emailVerified"] = "true",
                ["guest"] = buyer.Registered ? "false" : "true",
                ["source"] = "demo-fill",
            };
            if (priced.PromoApplied && !string.IsNullOrWhiteSpace(priced.NormalizedPromoCode))
            {
                metadata["promoCode"] = priced.NormalizedPromoCode;
            }

            PaymentIntent intent;
            try
            {
                intent = await paymentIntents.CreateAsync(new PaymentIntentCreateOptions
                {
                    Amount = priced.AmountMinorUnits,
                    Currency = priced.Currency.ToLowerInvariant(),
                    PaymentMethod = Cards[random.Next(Cards.Length)],
                    PaymentMethodTypes = ["card"],
                    Confirm = true,
                    Description = "Tale Shop demo order (fill)",
                    Metadata = metadata,
                });
            }
            catch (Exception ex) when (ex is StripeException or HttpRequestException)
            {
                Console.Error.WriteLine($"  skipped: Stripe payment failed ({ex.Message})");
                if (++failuresInRow >= 3)
                {
                    Console.Error.WriteLine("demo-fill: three Stripe failures in a row — stopping orders.");
                    break;
                }
                continue;
            }
            failuresInRow = 0;

            var visitor = visitorOf[buyer.Email];
            await finalization.RecordIntentCreatedAsync(new IntentCreatedRecord
            {
                PaymentIntentId = intent.Id,
                UserId = buyer.Email,
                Currency = priced.Currency,
                BuyerCountry = priced.BuyerCountry ?? buyer.Country,
                Language = "en",
                Subtotal = priced.Subtotal,
                DiscountTotal = priced.DiscountTotal,
                TaxTotal = 0m,
                Total = priced.Total,
                CheckoutItems = priced.Items,
                VisitorId = visitor,
                Attribution = new OrderAttribution
                {
                    Source = channel.Source,
                    Medium = channel.Medium,
                    Campaign = channel.Campaign,
                    LandingPath = random.NextDouble() < 0.5 ? "/games" : $"/games/{products[random.Next(products.Count)].Slug}",
                    FirstSeenUtc = date.AddMinutes(-random.Next(15, 4000)),
                },
            });
            var result = await finalization.FinalizeAsync(new OrderFinalizationRequest
            {
                PaymentIntentId = intent.Id,
                Source = "webhook",
                EnforceAttemptLimit = false,
            });
            if (result.OrderId is null)
            {
                Console.Error.WriteLine($"  skipped: finalization {result.Outcome} ({result.ErrorMessage})");
                continue;
            }
            var order = await orders.GetOrderByIdAsync(result.OrderId);
            await DemoSeedCli.MoveToDateAsync(order, date, orders, keys, cashback);
            created.Add(order.Id.ToString());
            AddPurchasePath(priced.Items.Select(item => item.GameId).OfType<string>().ToList(), products,
                buyer.Registered ? buyer.Email : null, visitor, date, random, events);
            Console.WriteLine($"  {date:yyyy-MM-dd} {order.OrderNumber} {buyer.Name,-20} {order.TotalAmount,8:0.00} {order.Currency} {channel.Source}/{channel.Medium}");
        }
        return created;
    }

    private static (string Source, string Medium, string? Campaign) PickChannel(Random random)
    {
        var roll = random.Next(Channels.Sum(c => c.Weight));
        foreach (var channel in Channels)
        {
            if ((roll -= channel.Weight) < 0)
            {
                return (channel.Source, channel.Medium, channel.Campaign);
            }
        }
        return ("direct", "none", null);
    }

    /// <summary>Путь покупателя перед заказом: просмотры купленных (и ещё пары) игр → корзина → оформление.</summary>
    private static void AddPurchasePath(List<string> gameIds, List<CatalogItem> products, string? userId, string visitor,
        DateTime orderedAt, Random random, List<GameTrackingEventDb> events)
    {
        var browsed = gameIds.Concat(products.OrderBy(_ => random.Next()).Take(random.Next(0, 3)).Select(p => p.Id)).ToList();
        foreach (var gameId in browsed)
        {
            events.Add(Event(gameId, userId, visitor, "game_view", orderedAt.AddMinutes(-random.Next(12, 240))));
            if (random.NextDouble() < 0.3)
            {
                events.Add(Event(gameId, userId, visitor, "media_play", orderedAt.AddMinutes(-random.Next(10, 200)), "video"));
            }
        }
        foreach (var gameId in gameIds)
        {
            events.Add(Event(gameId, userId, visitor, "add_to_cart", orderedAt.AddMinutes(-random.Next(4, 11))));
        }
        events.Add(Event(gameIds.FirstOrDefault(), userId, visitor, "begin_checkout", orderedAt.AddMinutes(-random.Next(1, 4))));
    }

    private static GameTrackingEventDb Event(string? gameId, string? userId, string visitor, string type, DateTime at, string? mediaType = null) => new()
    {
        Id = ObjectId.GenerateNewId().ToString(),
        GameId = gameId!,
        UserId = userId!,
        AnonId = visitor,
        EventType = type,
        MediaType = mediaType!,
        Timestamp = at,
    };

    private static async Task LinkOlderOrdersAsync(IMongoDatabase database, DateTime from, Random random, List<GameTrackingEventDb> events)
    {
        var collection = database.GetCollection<BsonDocument>("Orders");
        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Gte("OrderDate", from),
            Builders<BsonDocument>.Filter.Or(
                Builders<BsonDocument>.Filter.Exists("VisitorId", false),
                Builders<BsonDocument>.Filter.Eq("VisitorId", BsonNull.Value),
                Builders<BsonDocument>.Filter.Eq("VisitorId", string.Empty)));
        var older = await collection.Find(filter).ToListAsync();
        foreach (var order in older)
        {
            var visitor = NewVisitorId(random);
            await collection.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", order["_id"]), Builders<BsonDocument>.Update.Set("VisitorId", visitor));
            var gameIds = order.GetValue("Items", new BsonArray()).AsBsonArray
                .Select(item => item.AsBsonDocument.GetValue("GameId", BsonNull.Value))
                .Where(value => !value.IsBsonNull).Select(value => value.ToString()!).ToList();
            if (gameIds.Count == 0)
            {
                continue;
            }
            var placedAsGuest = order.GetValue("PlacedAsGuest", true).ToBoolean();
            var userId = placedAsGuest ? null : order.GetValue("UserId", BsonNull.Value).IsBsonNull ? null : order["UserId"].AsString;
            var paidAt = order.GetValue("PaidAt", BsonNull.Value);
            var at = (paidAt.IsBsonNull ? order["OrderDate"] : paidAt).ToUniversalTime();
            AddPurchasePath(gameIds, new List<CatalogItem>(), userId, visitor, at, random, events);
        }
        Console.WriteLine($"  linked {older.Count} earlier orders to visitors");
    }

    private static void AddBrowsingVisitors(List<CatalogItem> products, IReadOnlyList<Buyer> buyers, DateTime from, DateTime now,
        int count, Random random, List<GameTrackingEventDb> events)
    {
        var days = (now - from).TotalDays;
        for (var i = 0; i < count; i++)
        {
            var visitor = NewVisitorId(random);
            // Часть смотрящих — вошедшие покупатели, остальные — гости.
            var userId = random.NextDouble() < 0.12 ? buyers[random.Next(RegisteredCount)].Email : null;
            var start = now.AddDays(-days * Math.Pow(random.NextDouble(), 1.3)).AddMinutes(-random.Next(0, 600));
            var viewed = products.OrderBy(_ => random.Next()).Take(random.Next(1, 5)).ToList();
            var at = start;
            foreach (var product in viewed)
            {
                at = at.AddMinutes(random.Next(1, 9));
                events.Add(Event(product.Id, userId, visitor, "game_view", at));
                if (random.NextDouble() < 0.18)
                {
                    events.Add(Event(product.Id, userId, visitor, "media_play", at.AddSeconds(random.Next(10, 90)), "video"));
                }
            }
            if (random.NextDouble() < 0.22)
            {
                at = at.AddMinutes(random.Next(1, 6));
                events.Add(Event(viewed[0].Id, userId, visitor, "add_to_cart", at));
                if (random.NextDouble() < 0.38)
                {
                    events.Add(Event(viewed[0].Id, userId, visitor, "begin_checkout", at.AddMinutes(random.Next(1, 5))));
                }
            }
        }
    }

    private static async Task SeedCartsAsync(IMongoDatabase database, List<CatalogItem> products, List<Buyer> nonBuyers, DateTime now,
        Random random, Action<string, string> track)
    {
        var carts = database.GetCollection<CartDb>("Cart");
        foreach (var buyer in nonBuyers)
        {
            var cart = new CartDb
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = buyer.Email,
                UpdatedAt = now.AddHours(-random.Next(6, 24 * 12)),
                CartGames = products.OrderBy(_ => random.Next()).Take(random.Next(1, 3)).Select(product => new CartGameDb
                {
                    GameId = product.Id,
                    Name = product.Title,
                    Price = product.FinalPrice,
                    Quantity = 1,
                    Image = product.ImagePath,
                }).ToArray(),
            };
            // Покупатели выдуманные (@example.com): прежняя корзина такого покупателя заменяется целиком.
            await carts.DeleteManyAsync(c => c.UserId == buyer.Email);
            await carts.InsertOneAsync(cart);
            track("Cart", cart.Id);
        }
    }

    private static async Task SeedNewsletterAsync(IMongoDatabase database, IReadOnlyList<Buyer> buyers, DateTime from, DateTime now,
        Random random, Action<string, string> track)
    {
        var subscribers = database.GetCollection<NewsletterSubscriberDb>("NewsletterSubscribers");
        string[] sources = ["footer", "footer", "checkout", "account", "blog_post", "popup"];
        string[] locales = ["en", "en", "en", "de", "pl", "fr", "ru", "uk"];
        var days = (now - from).TotalDays;
        var rows = new List<NewsletterSubscriberDb>();
        var emails = buyers.Where(b => b.Registered).Select(b => (b.Email, UserId: (string?)b.Email))
            .Concat(Enumerable.Range(1, 110).Select(n =>
            {
                var person = People[random.Next(People.Length)];
                return ($"{person.First.ToLowerInvariant()}{random.Next(10, 99)}.{n}@example.com", (string?)null);
            }))
            .Where(_ => random.NextDouble() < 0.85)
            .DistinctBy(pair => pair.Item1);
        foreach (var (email, userId) in emails)
        {
            var createdAt = now.AddDays(-days * Math.Pow(random.NextDouble(), 1.2)).AddMinutes(-random.Next(0, 1440));
            var roll = random.NextDouble();
            var status = roll < 0.74 ? SubscriberStatus.Confirmed : roll < 0.87 ? SubscriberStatus.Pending : SubscriberStatus.Unsubscribed;
            DateTime? confirmedAt = status == SubscriberStatus.Pending ? null : createdAt.AddMinutes(random.Next(2, 300));
            rows.Add(new NewsletterSubscriberDb
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Email = email,
                Status = status,
                Sources = [userId is null ? sources[random.Next(sources.Length)] : "account"],
                UserId = userId,
                Locale = locales[random.Next(locales.Length)],
                DealAlerts = random.NextDouble() < 0.6,
                ConfirmToken = status == SubscriberStatus.Pending ? Guid.NewGuid().ToString("N") : null,
                UnsubscribeToken = Guid.NewGuid().ToString("N"),
                CreatedAt = createdAt,
                UpdatedAt = createdAt,
                ConfirmedAt = confirmedAt,
                UnsubscribedAt = status == SubscriberStatus.Unsubscribed ? confirmedAt!.Value.AddDays(random.Next(1, 20)) : null,
            });
        }
        var existing = (await subscribers.Find(Builders<NewsletterSubscriberDb>.Filter.In(s => s.Email, rows.Select(r => r.Email))).ToListAsync())
            .Select(s => s.Email).ToHashSet(StringComparer.OrdinalIgnoreCase);
        rows = rows.Where(r => !existing.Contains(r.Email)).ToList();
        if (rows.Count > 0)
        {
            await subscribers.InsertManyAsync(rows);
            rows.ForEach(r => track("NewsletterSubscribers", r.Id!));
        }

        var campaigns = database.GetCollection<NewsletterCampaignDb>("NewsletterCampaigns");
        var confirmed = rows.Count(r => r.Status != SubscriberStatus.Pending);
        var list = new List<NewsletterCampaignDb>
        {
            Campaign(CampaignType.Manual, "Autumn Sale is live — up to 60% off", now.AddDays(-(days - 12)), (int)(confirmed * 0.55), random),
            Campaign(CampaignType.Digest, "This week's best game deals", now.AddDays(-(days / 2)), (int)(confirmed * 0.75), random),
            Campaign(CampaignType.Manual, "New releases: Endless Legend 2 and more", now.AddDays(-9), (int)(confirmed * 0.9), random),
            Campaign(CampaignType.Digest, "Deals of the week + a 10% welcome code", now.AddDays(-2), confirmed, random),
        };
        await campaigns.InsertManyAsync(list);
        list.ForEach(c => track("NewsletterCampaigns", c.Id!));
    }

    private static NewsletterCampaignDb Campaign(string type, string subject, DateTime at, int recipients, Random random)
    {
        var failed = random.Next(0, Math.Max(1, recipients / 40));
        return new NewsletterCampaignDb
        {
            Id = ObjectId.GenerateNewId().ToString(),
            Type = type,
            Subject = subject,
            BodyText = subject + "\n\nOpen Tale Shop to see this week's picks.",
            Status = CampaignStatus.Sent,
            RecipientCount = recipients,
            SentCount = recipients - failed,
            FailedCount = failed,
            CreatedBy = type == CampaignType.Manual ? "owner" : null,
            Locale = "en",
            CreatedAt = at,
            CompletedAt = at.AddMinutes(random.Next(2, 15)),
        };
    }

    private sealed record ChatScript(string Category, string Question, string Answer, string? InstantTopic);

    private static readonly ChatScript[] ChatScripts =
    [
        new("Key delivery / activation", "Where can I find my key after paying?", "Your key is on the order page right away (Account → Orders) and in the confirmation email. In Steam: Games → Activate a Product on Steam, then paste the key.", "key_delivery"),
        new("Key delivery / activation", "Steam says the key is already activated", "Sorry about that! Please send a screenshot of the Steam error and your order number — a specialist will check the key and replace it if it was used before.", null),
        new("Refund request", "Can I get a refund if I haven't activated the key?", "Yes — unused keys can be refunded within 14 days. Open the order and press “Request refund”, or tell me the order number and I'll start it.", "refund"),
        new("Payment & checkout", "My card was declined at checkout", "Card declines usually come from the bank's fraud check. Try again in a few minutes, use another card, or Apple Pay / Google Pay. You were not charged for the declined attempt.", "payment"),
        new("Order status", "My order shows Processing for 10 minutes", "Most orders are delivered within a minute; some payments get an extra bank check. I see your order is paid — the key will appear on the order page shortly.", null),
        new("Game / product question", "Is this key region-locked?", "The product page shows the activation region under “Region”. Keys marked “Global” work everywhere; regional keys only activate in the listed countries.", null),
        new("Account & security", "I can't log in, password reset email never arrives", "Please check the spam folder — the email comes from no-reply@tale-shop.com. If it's not there, I can pass you to a specialist to verify the account.", null),
        new("Payment & checkout", "How does cashback work?", "You get 1% of every paid order back as store credit. It unlocks after 14 days and can pay for up to the full price of your next order.", null),
    ];

    private static async Task SeedChatsAsync(IMongoDatabase database, IReadOnlyList<Buyer> buyers, DateTime from, DateTime now,
        Random random, Action<string, string> track)
    {
        var sessions = database.GetCollection<ChatSession>("SupportChatSessions");
        var messages = database.GetCollection<ChatMessage>("SupportChatMessages");
        var days = (now - from).TotalDays;
        const int count = 64;
        for (var i = 0; i < count; i++)
        {
            var script = ChatScripts[random.Next(ChatScripts.Length)];
            var buyer = random.NextDouble() < 0.6 ? buyers[random.Next(RegisteredCount)] : null;
            var start = now.AddDays(-days * Math.Pow(random.NextDouble(), 1.3)).AddMinutes(-random.Next(0, 600));
            // Последние два — ждут специалиста прямо сейчас (видно на обзоре админки).
            var waiting = i >= count - 2;
            var escalated = waiting || random.NextDouble() < 0.16;
            if (waiting)
            {
                start = now.AddMinutes(-random.Next(20, 180));
            }
            var session = new ChatSession
            {
                Id = ObjectId.GenerateNewId().ToString(),
                CreatedAt = start,
                UserId = buyer?.Email,
                Email = buyer?.Email,
                Locale = "en",
                Language = "en",
                Category = script.Category,
                Summary = script.Question,
                WasEscalated = escalated,
                EscalationSource = escalated ? (EscalationSource?)random.Next(0, 4) : null,
                EscalationReason = escalated ? "Needs a person: " + script.Category.ToLowerInvariant() : null,
                Priority = escalated && random.NextDouble() < 0.3 ? ChatPriority.High : ChatPriority.Normal,
                Status = waiting ? ChatSessionStatus.NeedsAgent : ChatSessionStatus.Closed,
            };
            var rows = new List<ChatMessage>();
            var at = start;
            void Add(ChatMessageRole role, string author, string text, ChatMessageMetadata? metadata = null)
            {
                at = at.AddSeconds(random.Next(8, 90));
                rows.Add(new ChatMessage
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    SessionId = session.Id,
                    Role = role,
                    AuthorName = author,
                    Text = text,
                    CreatedAt = at,
                    Metadata = metadata ?? new ChatMessageMetadata(),
                });
            }
            Add(ChatMessageRole.User, buyer?.Name ?? "Guest", script.Question);
            var instant = script.InstantTopic is not null && random.NextDouble() < 0.5;
            var input = random.Next(900, 2600);
            var output = random.Next(70, 260);
            Add(ChatMessageRole.Assistant, "Tale Support (AI)", script.Answer, new ChatMessageMetadata
            {
                Model = instant ? null : "deepseek-flash",
                Instant = instant,
                InstantTopic = instant ? script.InstantTopic : null,
                InputTokens = instant ? null : input,
                CachedInputTokens = instant ? null : input / 2,
                OutputTokens = instant ? null : output,
                CostUsd = instant ? 0 : Math.Round(input * 0.00000014 + output * 0.00000028, 6),
                Feedback = random.NextDouble() switch { < 0.32 => ChatMessageFeedback.Helpful, < 0.4 => ChatMessageFeedback.NotHelpful, _ => null },
            });
            if (escalated)
            {
                Add(ChatMessageRole.User, buyer?.Name ?? "Guest", "Can I talk to a person, please?");
                Add(ChatMessageRole.System, "System", "Chat handed over to a support specialist.", new ChatMessageMetadata { Handoff = true });
                if (!waiting)
                {
                    session.AssignedAgentName = "Anna (Support)";
                    Add(ChatMessageRole.Agent, "Anna (Support)", "Hi! I've checked your order — all sorted now. Anything else I can help with?");
                    Add(ChatMessageRole.User, buyer?.Name ?? "Guest", "That's it, thanks a lot!");
                }
            }
            session.LastMessageAt = at;
            session.UpdatedAt = at;
            session.LastSeenAt = at;
            await sessions.InsertOneAsync(session);
            await messages.InsertManyAsync(rows);
            track("SupportChatSessions", session.Id);
            rows.ForEach(m => track("SupportChatMessages", m.Id));
        }
    }

    private static async Task SeedTicketsAsync(IMongoDatabase database, IReadOnlyList<Buyer> buyers, DateTime from, DateTime now,
        Random random, Action<string, string> track)
    {
        var tickets = database.GetCollection<SupportTicket>("SupportTickets");
        var messages = database.GetCollection<SupportMessage>("SupportMessages");
        var counters = database.GetCollection<SupportTicketCounter>("SupportTicketCounters");
        (string Subject, string Category, SupportTicketStatus Status, string Body, string? Reply)[] scripts =
        [
            ("Key shows as already used", "Key delivery / activation", SupportTicketStatus.Resolved, "Steam says the key was already activated by another account. Order attached.", "We've checked the key and sent you a replacement on the order page. Sorry for the trouble!"),
            ("Charged twice for one order", "Payment & checkout", SupportTicketStatus.Resolved, "I see two charges from Tale Shop on my card for the same order.", "One of them was a temporary hold from a declined attempt — your bank releases it within 3–5 days. Only one charge was captured."),
            ("Refund for a gift I bought by mistake", "Refund request", SupportTicketStatus.Closed, "I bought the wrong edition, the key isn't activated. Can I get a refund?", "Done — the refund is on its way and should reach your card in 5–10 business days."),
            ("Region question before buying", "Game / product question", SupportTicketStatus.WaitingForUser, "Will this key work in Japan?", "This one is a Global key, so yes. Let us know if you'd like help with activation."),
            ("Invoice with VAT number", "Order status", SupportTicketStatus.WaitingForSupport, "Could you add my company VAT number to the invoice?", null),
            ("Can't change my email", "Account & security", SupportTicketStatus.Open, "The settings page doesn't let me change my email address.", null),
            ("Activation guide for Ubisoft Connect", "Key delivery / activation", SupportTicketStatus.Resolved, "Where do I activate a Ubisoft key?", "Open Ubisoft Connect → Settings → Activate a key, then paste it. The game appears in your library right away."),
            ("Cashback not credited yet", "Payment & checkout", SupportTicketStatus.Resolved, "My cashback still shows as pending.", "Cashback unlocks 14 days after the order — after that it's yours to spend."),
        ];
        var days = (now - from).TotalDays;
        foreach (var script in scripts)
        {
            var buyer = buyers[random.Next(RegisteredCount)];
            var counter = await counters.FindOneAndUpdateAsync<SupportTicketCounter>(c => c.Id == "support_ticket",
                Builders<SupportTicketCounter>.Update.Inc(c => c.Seq, 1),
                new FindOneAndUpdateOptions<SupportTicketCounter> { IsUpsert = true, ReturnDocument = ReturnDocument.After });
            var createdAt = script.Status is SupportTicketStatus.Open or SupportTicketStatus.WaitingForSupport
                ? now.AddHours(-random.Next(3, 40))
                : now.AddDays(-random.NextDouble() * days);
            var ticket = new SupportTicket
            {
                Id = ObjectId.GenerateNewId().ToString(),
                PublicId = $"TKT-{counter.Seq:00000}",
                UserId = buyer.Email,
                UserEmail = buyer.Email,
                Subject = script.Subject,
                Category = script.Category,
                Status = script.Status,
                CreatedAt = createdAt,
            };
            var rows = new List<SupportMessage>
            {
                new() { Id = ObjectId.GenerateNewId().ToString(), TicketId = ticket.Id, AuthorType = SupportAuthorType.User, AuthorId = buyer.Email, AuthorName = buyer.Name, Body = script.Body, CreatedAt = createdAt },
            };
            if (script.Reply is not null)
            {
                rows.Add(new SupportMessage { Id = ObjectId.GenerateNewId().ToString(), TicketId = ticket.Id, AuthorType = SupportAuthorType.Support, AuthorId = "support", AuthorName = "Anna (Support)", Body = script.Reply, CreatedAt = createdAt.AddHours(random.Next(1, 9)) });
            }
            ticket.MessagesCount = rows.Count;
            ticket.LastMessageAt = rows[^1].CreatedAt;
            ticket.LastMessageBy = rows[^1].AuthorType;
            ticket.UpdatedAt = rows[^1].CreatedAt;
            await tickets.InsertOneAsync(ticket);
            await messages.InsertManyAsync(rows);
            track("SupportTickets", ticket.Id);
            rows.ForEach(m => track("SupportMessages", m.Id));
        }
    }

    /// <summary>Несколько опубликованных отзывов — на модерацию: три ждут проверки, два скрыты по жалобам. Возвращает прежние статусы.</summary>
    private static async Task<Dictionary<string, string>> SeedModerationAsync(IMongoDatabase database, DateTime now, Random random)
    {
        var reviews = database.GetCollection<BsonDocument>("GameReviews");
        var published = await reviews.Find(Builders<BsonDocument>.Filter.Eq("status", "Published")).Limit(200).ToListAsync();
        var picked = published.OrderBy(_ => random.Next()).Take(5).ToList();
        var previous = new Dictionary<string, string>();
        for (var i = 0; i < picked.Count; i++)
        {
            var id = picked[i]["_id"];
            previous[id.ToString()!] = "Published";
            var hidden = i >= 3;
            await reviews.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", id), Builders<BsonDocument>.Update
                .Set("status", hidden ? "Hidden" : "Pending")
                .Set("reportCount", hidden ? random.Next(3, 7) : random.Next(1, 3))
                .Set("lastReportedAt", now.AddHours(-random.Next(2, 72))));
        }
        return previous;
    }

    private static async Task SeedPaymentFailuresAsync(IMongoDatabase database, IReadOnlyList<Buyer> buyers, DateTime from, DateTime now,
        Random random, Action<string, string> track)
    {
        var failures = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
        (string Code, string Message, string Status, int HoursAgo)[] rows =
        [
            ("keys_out_of_stock", "Paid, but no keys left for one item — waiting for restock.", "Open", 5),
            ("finalization_timeout", "Stripe webhook arrived while the order was being finalized; retried.", "Resolved", 24 * 9),
            ("amount_mismatch", "Charged amount differs from the checkout total by 0.01 USD (rounding).", "Open", 30),
        ];
        foreach (var row in rows)
        {
            var at = now.AddHours(-row.HoursAgo);
            var failure = new PaymentFinalizationFailureDb
            {
                Id = ObjectId.GenerateNewId(),
                PaymentIntentId = "pi_demo_" + Guid.NewGuid().ToString("N")[..20],
                UserId = buyers[random.Next(RegisteredCount)].Email,
                CreatedAt = at,
                LastSeenAt = at.AddMinutes(random.Next(1, 30)),
                Attempts = random.Next(1, 4),
                ErrorCode = row.Code,
                ErrorMessage = row.Message,
                TraceId = Guid.NewGuid().ToString("N"),
                Status = row.Status,
            };
            await failures.InsertOneAsync(failure);
            track("PaymentFinalizationFailures", failure.Id.ToString());
        }
    }

    private static async Task SeedChannelSpendAsync(IMongoDatabase database, DateTime from, DateTime now, Random random, Action<string, string> track)
    {
        var spend = database.GetCollection<ChannelSpendDb>("ChannelSpend");
        (string Source, int Min, int Max)[] budgets = [("google", 90, 160), ("youtube", 40, 80), ("reddit", 25, 55), ("twitter", 10, 30)];
        for (var week = from.Date; week < now; week = week.AddDays(7))
        {
            foreach (var budget in budgets)
            {
                var row = new ChannelSpendDb
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    Source = budget.Source,
                    SpentOnUtc = week,
                    Amount = random.Next(budget.Min, budget.Max) + random.Next(0, 100) / 100m,
                    Currency = "USD",
                    Note = "Weekly ad budget",
                };
                await spend.InsertOneAsync(row);
                track("ChannelSpend", row.Id);
            }
        }
    }

    private static async Task<int> ResetAsync(IMongoDatabase database, IMongoCollection<BsonDocument> marker)
    {
        var fills = await marker.Find(FilterDefinition<BsonDocument>.Empty).ToListAsync();
        if (fills.Count == 0)
        {
            Console.WriteLine("demo-fill: nothing to reset.");
            return 0;
        }
        foreach (var fill in fills)
        {
            foreach (var element in fill["ids"].AsBsonDocument)
            {
                if (element.Name == "Orders")
                {
                    continue; // заказы связаны с ключами, кэшбэком и промокодами — остаются
                }
                var values = element.Value.AsBsonArray.Select(v => ObjectId.TryParse(v.AsString, out var oid) ? (BsonValue)oid : v).ToList();
                var result = await database.GetCollection<BsonDocument>(element.Name).DeleteManyAsync(Builders<BsonDocument>.Filter.In("_id", values));
                Console.WriteLine($"  {element.Name}: removed {result.DeletedCount}");
            }
            if (fill.TryGetValue("reviewStatuses", out var statuses))
            {
                var reviews = database.GetCollection<BsonDocument>("GameReviews");
                foreach (var review in statuses.AsBsonDocument)
                {
                    var id = ObjectId.TryParse(review.Name, out var oid) ? (BsonValue)oid : review.Name;
                    await reviews.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", id),
                        Builders<BsonDocument>.Update.Set("status", review.Value).Set("reportCount", 0).Unset("lastReportedAt"));
                }
            }
            await marker.DeleteOneAsync(Builders<BsonDocument>.Filter.Eq("_id", fill["_id"]));
        }
        Console.WriteLine("demo-fill: reset done (orders kept).");
        return 0;
    }
}
