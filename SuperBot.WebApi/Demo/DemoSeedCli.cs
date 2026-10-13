using MongoDB.Bson;
using MongoDB.Driver;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Наполняет демо-сайт жизнью: история заказов за последние месяцы (в том числе у демо-админа — с кэшбэком),
/// пара возвратов, отзывы покупателей, распродажи и промокоды. Чтобы админка и кабинет показывали правду, а не
/// нарисованные цифры, заказы оформляются тем же путём, что у покупателя: настоящий тестовый платёж Stripe
/// (карта pm_card_visa) → касса → штатная финализация (ключи, промокод, кэшбэк). Потом даты сдвигаются в прошлое.
///
///   docker compose run --rm --no-deps -e Mail__DryRun=true backend demo-seed demo-admin@taleshop-demo.invalid [заказов, 60] [дней, 120] [--force]
///
/// Первый аргумент — ключ покупателя демо-админа: магазин привязывает заказы, ключи и кэшбэк к почте из токена
/// (CurrentUserExtensions.GetUserKey), а не к id Keycloak.
///
/// Только демо (Demo:Enabled) и только тестовый ключ Stripe. Повторно не выполняется без --force: история задвоилась бы.
/// Письма при наполнении не отправляются (Mail:DryRun) — адреса покупателей выдуманные (@example.com).
/// </summary>
public static class DemoSeedCli
{
    public const string Command = "demo-seed";
    private const string MarkerCollection = "DemoSeed";

    private sealed record Customer(string Name, string Email, string Country);

    private static readonly Customer[] Customers =
    [
        new("Liam Walker", "liam.walker@example.com", "US"),
        new("Emma Schmidt", "emma.schmidt@example.com", "DE"),
        new("Oliver Brown", "oliver.brown@example.com", "GB"),
        new("Zofia Nowak", "zofia.nowak@example.com", "PL"),
        new("Lucas Martin", "lucas.martin@example.com", "FR"),
        new("Mia Rossi", "mia.rossi@example.com", "IT"),
        new("Noah Johnson", "noah.johnson@example.com", "CA"),
        new("Sofia Garcia", "sofia.garcia@example.com", "ES"),
        new("Ethan Miller", "ethan.miller@example.com", "US"),
        new("Jakub Kowalski", "jakub.kowalski@example.com", "PL"),
        new("Chloe Dubois", "chloe.dubois@example.com", "FR"),
        new("Lucas Silva", "lucas.silva@example.com", "BR"),
        new("Ava Wilson", "ava.wilson@example.com", "AU"),
        new("Mason Taylor", "mason.taylor@example.com", "US"),
        new("Isabella Andersson", "isabella.andersson@example.com", "SE"),
        new("Leon Fischer", "leon.fischer@example.com", "DE"),
        new("Amelia Clark", "amelia.clark@example.com", "GB"),
        new("Mateo Lopez", "mateo.lopez@example.com", "MX"),
        new("Olivia Moore", "olivia.moore@example.com", "US"),
        new("Daniel Novak", "daniel.novak@example.com", "CZ"),
    ];

    private static readonly string[] Cards = ["pm_card_visa", "pm_card_visa", "pm_card_visa", "pm_card_mastercard", "pm_card_amex"];

    private static readonly Dictionary<int, string[]> ReviewTexts = new()
    {
        [5] =
        [
            "Key arrived in seconds and activated on Steam without any issues. Great price too!",
            "Instant delivery, worked first try. Will definitely buy here again.",
            "One of the best games I've played this year — and I got it on sale. Smooth purchase.",
            "Fast, cheap and legit. The cashback is a nice bonus.",
            "Absolutely worth it. Activation was instant, no region problems.",
        ],
        [4] =
        [
            "Great game, quick delivery. Took a minute for the email, but the key was already in my account.",
            "Good value for the money. Would love to see more bundles.",
            "Solid purchase, key worked fine. Checkout was easy.",
        ],
        [3] =
        [
            "The game is fine, not my favourite genre. The store itself worked perfectly.",
            "Decent, but I expected more content for the price. Key delivery was instant.",
        ],
        [2] = ["Not really my kind of game, but the key worked and support answered quickly."],
        [1] = ["Refunded — the game just didn't run well on my old laptop. Support handled it fast."],
    };

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var positional = args.Where(a => !a.StartsWith("--", StringComparison.Ordinal)).ToArray();
        var force = args.Contains("--force");
        // Только заказы: пробный прогон перед полным (скидки, отзывы, промокоды и возвраты не трогаются).
        var ordersOnly = args.Contains("--orders-only");
        if (positional.Length == 0)
        {
            Console.Error.WriteLine("Usage: demo-seed <demo-admin email> [orders=60] [days=120] [--force] [--orders-only]");
            return 2;
        }
        var adminUserId = positional[0];
        if (!adminUserId.Contains('@'))
        {
            Console.Error.WriteLine("demo-seed: pass the demo admin email (orders are keyed by email, not by the Keycloak id).");
            return 2;
        }
        var orderCount = positional.Length > 1 && int.TryParse(positional[1], out var o) && o > 0 ? o : 60;
        var days = positional.Length > 2 && int.TryParse(positional[2], out var d) && d > 7 ? d : 120;

        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var config = sp.GetRequiredService<IConfiguration>();
        if (!config.GetValue<bool>("Demo:Enabled"))
        {
            Console.Error.WriteLine("demo-seed: Demo:Enabled is false — this is not a demo site, nothing done.");
            return 1;
        }
        var stripeKey = config["Stripe:SecretKey"] ?? string.Empty;
        if (!stripeKey.StartsWith("sk_test_", StringComparison.Ordinal))
        {
            Console.Error.WriteLine("demo-seed: Stripe:SecretKey is not a test key — refusing to create payments.");
            return 1;
        }
        // Обычно ставится позже, при старте веб-приложения; команда выполняется раньше.
        StripeConfiguration.ApiKey = stripeKey;

        var database = sp.GetRequiredService<IMongoDatabase>();
        var marker = database.GetCollection<BsonDocument>(MarkerCollection);
        if (!force && await marker.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty) > 0)
        {
            Console.Error.WriteLine("demo-seed: the demo is already seeded (collection DemoSeed). Use --force to add another round.");
            return 1;
        }

        var random = new Random(2026);
        var now = DateTime.UtcNow;

        if (!ordersOnly)
        {
            await SeedPromoCodesAsync(sp.GetRequiredService<IPromoCodeRepository>(), now);
        }

        var catalog = await sp.GetRequiredService<ICatalogSnapshotService>().GetAsync();
        var products = catalog
            .Where(item => !item.IsComingSoon && item.InStock && item.FinalPrice > 0 && item.ReleaseDate < now)
            .ToList();
        if (products.Count == 0)
        {
            Console.Error.WriteLine("demo-seed: no products in stock.");
            return 1;
        }

        var pricing = sp.GetRequiredService<ICheckoutPricingService>();
        var finalization = sp.GetRequiredService<IOrderFinalizationService>();
        var orders = sp.GetRequiredService<IOrderRepository>();
        var keys = database.GetCollection<GameKeyDb>("GameKeys");
        var cashbackEntries = database.GetCollection<CashbackEntryDb>("CashbackEntries");
        var paymentIntents = new PaymentIntentService();

        // Даты — с перекосом к недавним (магазин «растёт»), по возрастанию: промокоды и кэшбэк считаются по порядку.
        var dates = Enumerable.Range(0, orderCount)
            .Select(_ => now.AddDays(-days * Math.Pow(random.NextDouble(), 1.6)).AddHours(-random.Next(0, 12)))
            .OrderBy(date => date)
            .ToList();
        var activePromos = new[] { "SPRING15", "GAMER5", "VIP25" };
        var created = new List<(Order Order, string UserId, string UserName, DateTime Date)>();
        var failuresInRow = 0;

        for (var i = 0; i < orderCount; i++)
        {
            // Каждый седьмой заказ — демо-админа: у него в кабинете история и кэшбэк.
            var isAdmin = i % 7 == 3;
            var customer = Customers[random.Next(Customers.Length)];
            var userId = isAdmin ? adminUserId : customer.Email;
            var userName = isAdmin ? "Demo Admin" : customer.Name;
            var country = isAdmin ? "US" : customer.Country;

            var lineCount = random.NextDouble() switch { < 0.65 => 1, < 0.9 => 2, _ => 3 };
            var items = products.OrderBy(_ => random.Next()).Take(lineCount)
                .Select(product => new CheckoutPricingItem { GameId = product.Id, Quantity = 1 })
                .ToList();
            var promo = random.NextDouble() < 0.25 ? activePromos[random.Next(activePromos.Length)] : null;

            var priced = await PriceAsync(pricing, items, promo, userId, country);
            if (priced is null)
            {
                continue;
            }

            var metadata = new Dictionary<string, string>
            {
                ["userId"] = userId,
                ["itemCount"] = priced.Items.Count.ToString(),
                ["firstItemGameId"] = priced.Items[0].GameId ?? string.Empty,
                ["firstItemTitle"] = priced.Items[0].Title,
                ["currency"] = priced.Currency,
                ["emailVerified"] = "true",
                ["guest"] = isAdmin ? "false" : "true",
                ["source"] = "demo-seed",
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
                    Description = "Tale Shop demo order (seed)",
                    Metadata = metadata,
                });
            }
            catch (Exception ex) when (ex is StripeException or HttpRequestException)
            {
                Console.Error.WriteLine($"  skipped: Stripe payment failed ({ex.Message})");
                // Нет связи со Stripe или ключ не тот — дальше будет то же самое: останавливаемся, а не молотим впустую.
                if (++failuresInRow >= 3)
                {
                    Console.Error.WriteLine("demo-seed: three Stripe failures in a row — stopping.");
                    break;
                }
                continue;
            }
            failuresInRow = 0;

            await finalization.RecordIntentCreatedAsync(new IntentCreatedRecord
            {
                PaymentIntentId = intent.Id,
                UserId = userId,
                Currency = priced.Currency,
                BuyerCountry = priced.BuyerCountry ?? country,
                Language = "en",
                Subtotal = priced.Subtotal,
                DiscountTotal = priced.DiscountTotal,
                TaxTotal = 0m,
                Total = priced.Total,
                CheckoutItems = priced.Items,
                Attribution = new OrderAttribution
                {
                    Source = random.NextDouble() < 0.5 ? "google" : random.NextDouble() < 0.5 ? "reddit" : "direct",
                    Medium = "organic",
                    LandingPath = "/games",
                    FirstSeenUtc = dates[i].AddMinutes(-random.Next(5, 600)),
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
            await MoveToDateAsync(order, dates[i], orders, keys, cashbackEntries);
            created.Add((order, userId, userName, dates[i]));
            Console.WriteLine($"  {dates[i]:yyyy-MM-dd} {order.OrderNumber} {userName,-20} {order.TotalAmount,8:0.00} {order.Currency} {(order.PromoCode is null ? "" : order.PromoCode)}");
        }

        if (!ordersOnly)
        {
            await RefundSomeAsync(sp, created, orders, random);
            await SeedReviewsAsync(sp.GetRequiredService<IGameReviewRepository>(), created, now, random);
            await SeedDiscountsAsync(sp.GetRequiredService<IGameDiscountRepository>(), products, now, random);
        }
        await RefreshCashbackAsync(sp, database, adminUserId);
        sp.GetRequiredService<ICatalogSnapshotService>().Invalidate();

        if (ordersOnly)
        {
            Console.WriteLine($"Trial run: {created.Count} orders. Check them, then run the full seed with --force.");
            return created.Count > 0 ? 0 : 1;
        }
        await marker.InsertOneAsync(new BsonDocument
        {
            { "seededAt", DateTime.UtcNow },
            { "orders", created.Count },
            { "adminOrders", created.Count(c => c.UserId == adminUserId) },
        });
        Console.WriteLine($"Demo seeded: {created.Count} orders ({created.Count(c => c.UserId == adminUserId)} for demo-admin), reviews, discounts and promo codes.");
        return 0;
    }

    internal static async Task<CheckoutPricingResult?> PriceAsync(ICheckoutPricingService pricing, List<CheckoutPricingItem> items, string? promo, string userId, string country)
    {
        var request = new CheckoutPricingRequest { Items = items, PromoCode = promo, UserName = userId, Currency = "USD", BuyerCountry = country };
        var priced = await pricing.PriceAsync(request);
        if (!priced.Success && promo is not null)
        {
            // Промокод не подошёл (минимальная сумма, уже использован) — покупатель просто платит без него.
            request.PromoCode = null;
            priced = await pricing.PriceAsync(request);
        }
        return priced.Success && priced.Items.Count > 0 && priced.AmountMinorUnits > 0 ? priced : null;
    }

    /// <summary>Заказ «случился» в прошлом: его даты, события, выданные ключи и начисленный кэшбэк сдвигаются вместе.</summary>
    internal static async Task MoveToDateAsync(Order order, DateTime date, IOrderRepository orders,
        IMongoCollection<GameKeyDb> keys, IMongoCollection<CashbackEntryDb> cashback)
    {
        var shift = date - order.CreatedAt;
        order.OrderDate = order.OrderDate.Add(shift);
        order.CreatedAt = order.CreatedAt.Add(shift);
        order.PaidAt = order.PaidAt?.Add(shift);
        order.UpdatedAt = order.UpdatedAt?.Add(shift);
        foreach (var e in order.Events)
        {
            e.CreatedAt = e.CreatedAt.Add(shift);
        }
        if (order.Attribution?.FirstSeenUtc is { } seen && seen > order.CreatedAt)
        {
            order.Attribution.FirstSeenUtc = order.CreatedAt.AddMinutes(-30);
        }
        foreach (var delivery in order.Items.Select(item => item.Delivery).OfType<DeliverySnapshot>())
        {
            delivery.DeliveredAt = delivery.DeliveredAt?.Add(shift);
            foreach (var key in delivery.Keys)
            {
                key.DeliveredAt = key.DeliveredAt?.Add(shift);
            }
        }
        // В номере заказа — дата оформления (TS-20261009-ABC123): после сдвига она должна быть датой заказа.
        var oldNumber = order.OrderNumber;
        if (oldNumber is { Length: > 12 } && oldNumber.StartsWith("TS-", StringComparison.Ordinal))
        {
            order.OrderNumber = $"TS-{date:yyyyMMdd}{oldNumber[11..]}";
        }
        await orders.UpdateOrderAsync(order);

        var orderIds = new[] { order.Id.ToString(), oldNumber ?? string.Empty };
        // Выданные ключи: выдача — в день заказа, закупка партии — раньше выдачи (иначе склад «продал до покупки»).
        await keys.UpdateManyAsync(Builders<GameKeyDb>.Filter.In(k => k.OrderId, orderIds),
            Builders<GameKeyDb>.Update.Set(k => k.IssuedAt, date.AddSeconds(4)).Set(k => k.AcquiredAtUtc, date.AddDays(-7)));

        var entries = await cashback.Find(Builders<CashbackEntryDb>.Filter.In(c => c.OrderId, orderIds)).ToListAsync();
        foreach (var entry in entries)
        {
            await cashback.UpdateOneAsync(c => c.Id == entry.Id, Builders<CashbackEntryDb>.Update
                .Set(c => c.CreatedAt, entry.CreatedAt.Add(shift))
                .Set(c => c.UnlocksAt, entry.UnlocksAt?.Add(shift))
                .Set(c => c.ExpiresAt, entry.ExpiresAt?.Add(shift))
                .Set(c => c.OrderNumber, order.OrderNumber));
        }
    }

    /// <summary>Два возврата — полный и по одной позиции: в админке видно, как они выглядят. Деньги возвращает тестовый Stripe.</summary>
    private static async Task RefundSomeAsync(IServiceProvider sp, List<(Order Order, string UserId, string UserName, DateTime Date)> created,
        IOrderRepository orders, Random random)
    {
        var actions = sp.GetRequiredService<AdminOrderActionsService>();
        var candidates = created.Where(c => c.Order.PlacedAsGuest && c.Date < DateTime.UtcNow.AddDays(-20)).ToList();
        var full = candidates.Where(c => c.Order.Items.Count == 1).OrderBy(_ => random.Next()).FirstOrDefault();
        var partial = candidates.Where(c => c.Order.Items.Count > 1).OrderBy(_ => random.Next()).FirstOrDefault();

        if (full.Order is not null)
        {
            var order = await orders.GetOrderByIdAsync(full.Order.Id.ToString());
            var outcome = await actions.RefundAsync(order, "demo-seed", "The game did not run on the customer's laptop");
            await MoveRefundAsync(orders, full.Order.Id.ToString(), full.Date.AddDays(3));
            Console.WriteLine($"  refund (full) {order.OrderNumber}: {outcome}");
        }
        if (partial.Order is not null)
        {
            var order = await orders.GetOrderByIdAsync(partial.Order.Id.ToString());
            var item = order.Items[^1];
            var outcome = await actions.RefundItemAsync(order, "demo-seed", item.ItemId, 1, "Bought by mistake");
            await MoveRefundAsync(orders, partial.Order.Id.ToString(), partial.Date.AddDays(1));
            Console.WriteLine($"  refund (item) {order.OrderNumber}: {outcome}");
        }
    }

    private static async Task MoveRefundAsync(IOrderRepository orders, string orderId, DateTime when)
    {
        var order = await orders.GetOrderByIdAsync(orderId);
        var cutoff = DateTime.UtcNow.AddMinutes(-30);
        foreach (var e in order.Events.Where(e => e.CreatedAt > cutoff))
        {
            e.CreatedAt = when;
        }
        order.UpdatedAt = when;
        await orders.UpdateOrderAsync(order);
    }

    private static async Task SeedReviewsAsync(IGameReviewRepository reviews,
        List<(Order Order, string UserId, string UserName, DateTime Date)> created, DateTime now, Random random)
    {
        var count = 0;
        var seen = new HashSet<string>();
        foreach (var (order, userId, userName, date) in created.OrderBy(_ => random.Next()))
        {
            var gameId = order.Items.FirstOrDefault()?.GameId;
            if (gameId is null || !seen.Add($"{userId}|{gameId}") || random.NextDouble() > 0.55)
            {
                continue;
            }
            var rating = random.NextDouble() switch { < 0.5 => 5, < 0.82 => 4, < 0.93 => 3, < 0.97 => 2, _ => 1 };
            var texts = ReviewTexts[rating];
            var at = date.AddDays(random.Next(1, 20));
            if (at > now)
            {
                at = now.AddHours(-random.Next(1, 48));
            }
            await reviews.CreateAsync(new GameReview
            {
                Id = ObjectId.GenerateNewId().ToString(),
                GameId = gameId,
                UserId = userId,
                UserName = ShortName(userName),
                BuyerKey = userId,
                VerifiedPurchase = true,
                Rating = rating,
                PlaytimeHours = Math.Round(2 + random.NextDouble() * 80, 1),
                Text = texts[random.Next(texts.Length)],
                CreatedAt = at,
                HelpfulCount = random.Next(0, 24),
                Status = ReviewStatus.Published,
            });
            count++;
        }
        Console.WriteLine($"  reviews: {count}");
    }

    private static string ShortName(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? $"{parts[0]} {parts[1][0]}." : name;
    }

    /// <summary>Распродажи: у части игр скидки с разными сроками — на витрине «до конца N дней», в админке — список скидок.</summary>
    private static async Task SeedDiscountsAsync(IGameDiscountRepository discounts, List<CatalogItem> products, DateTime now, Random random)
    {
        int[] percents = [15, 20, 25, 30, 40, 50, 60, 75];
        int[] endsInDays = [2, 4, 6, 9, 13, 20, 27, 34];
        var picked = products.Where(p => p.DiscountPercent is null or 0).OrderBy(_ => random.Next()).Take(percents.Length).ToList();
        for (var i = 0; i < picked.Count; i++)
        {
            await discounts.UpsertAsync(new GameDiscount
            {
                GameId = picked[i].Id,
                DiscountPercent = percents[i],
                StartDate = now.AddDays(-random.Next(1, 12)),
                EndDate = now.AddDays(endsInDays[i]).Date.AddHours(23).AddMinutes(59),
            });
        }
        Console.WriteLine($"  discounts: {picked.Count}");
    }

    /// <summary>Промокоды разных видов: процент, фиксированная сумма с минимальным заказом, ограниченный, истёкший и будущий.</summary>
    private static async Task SeedPromoCodesAsync(IPromoCodeRepository promos, DateTime now)
    {
        PromoCode[] codes =
        [
            new() { Code = "SPRING15", Type = PromoCodeType.Percentage, Value = 15, StartDate = now.AddDays(-150), EndDate = now.AddDays(30), UsagePerUser = 1 },
            new() { Code = "GAMER5", Type = PromoCodeType.Fixed, Value = 5, Currency = "USD", MinOrderAmount = 25, StartDate = now.AddDays(-150), EndDate = now.AddDays(60) },
            new() { Code = "VIP25", Type = PromoCodeType.Percentage, Value = 25, MaxDiscountAmount = 20, UsageLimit = 100, UsagePerUser = 1, StartDate = now.AddDays(-150), EndDate = now.AddDays(45) },
            new() { Code = "STEAMFEST10", Type = PromoCodeType.Percentage, Value = 10, StartDate = now.AddDays(-200), EndDate = now.AddDays(-160) },
            new() { Code = "WEEKEND20", Type = PromoCodeType.Percentage, Value = 20, UsagePerUser = 1, StartDate = now.AddDays(3).Date, EndDate = now.AddDays(5).Date.AddHours(23) },
        ];
        var added = 0;
        foreach (var code in codes)
        {
            if (await promos.GetByCodeAsync(code.Code) is null)
            {
                code.CreatedAt = code.StartDate < now ? code.StartDate.AddDays(-2) : now;
                await promos.CreateAsync(code);
                added++;
            }
        }
        Console.WriteLine($"  promo codes: {added} added");
    }

    /// <summary>Снимок баланса кэшбэка для отчётов админки — по журналу с уже сдвинутыми датами (часть начислений разблокирована).</summary>
    internal static async Task RefreshCashbackAsync(IServiceProvider sp, IMongoDatabase database, string userKey)
    {
        var summary = await sp.GetRequiredService<SuperBot.Core.Cashback.ICashbackLedger>().GetSummaryAsync(userKey);
        await database.GetCollection<CashbackAccountDb>("CashbackAccounts").UpdateOneAsync(
            a => a.UserKey == userKey,
            Builders<CashbackAccountDb>.Update
                .Set(a => a.AvailableUsd, summary.AvailableUsd)
                .Set(a => a.PendingUsd, summary.PendingUsd)
                .Set(a => a.ReservedUsd, summary.ReservedUsd)
                .Set(a => a.EarnedAllTimeUsd, summary.EarnedAllTimeUsd)
                .Set(a => a.UsedAllTimeUsd, summary.UsedAllTimeUsd)
                .Set(a => a.QualifyingSpendUsd, summary.QualifyingSpendUsd)
                .Set(a => a.UpdatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
        Console.WriteLine($"  cashback {userKey}: available {summary.AvailableUsd:0.00}, pending {summary.PendingUsd:0.00} USD");
    }
}
