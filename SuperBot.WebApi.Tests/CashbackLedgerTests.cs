using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using SuperBot.Core.Cashback;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Журнал кэшбэка на настоящей (эфемерной) MongoDB: идемпотентность, резервы под платёж,
/// одновременные траты и возвраты. Сервис собирается прямо в тесте со своими настройками,
/// чтобы проверять и выключенную программу, и срок ожидания.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class CashbackLedgerTests
{
    private readonly TaleShopApiFactory _factory;
    private readonly string _user = $"cashback-{Guid.NewGuid():N}@taleshop.test";

    public CashbackLedgerTests(TaleShopApiFactory factory) => _factory = factory;

    private ICashbackLedger Ledger(CashbackOptions? options = null)
    {
        // IMongoDatabase зарегистрирован scoped; сам объект — лёгкая обёртка над общим клиентом,
        // поэтому переживает свою область без последствий.
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        return new CashbackLedgerService(
            database,
            new StaticOptions(options ?? new CashbackOptions { Enabled = true, PendingDays = 0 }),
            NullLogger<CashbackLedgerService>.Instance);
    }

    private static CashbackEarnRequest Order(string user, decimal paid, string? orderId = null) => new()
    {
        UserKey = user,
        OrderId = orderId ?? Guid.NewGuid().ToString(),
        OrderNumber = "TS-TEST",
        GameTitle = "Test Game",
        PaidUsd = paid,
        OrderTotal = paid,
        OrderCurrency = "USD",
        OrderedAt = DateTime.UtcNow
    };

    [Fact]
    public async Task Earning_is_idempotent_per_order_and_uses_the_level_before_the_order()
    {
        var ledger = Ledger();
        var first = Order(_user, 250m);

        var earned = await ledger.EarnAsync(first);
        var again = await ledger.EarnAsync(first);

        Assert.Equal(7.50m, earned!.AmountUsd); // 3% — до заказа покупатель был на Rookie
        Assert.Equal(earned.Id, again!.Id);

        // Уже $250 покупок — следующий заказ считается по Veteran, 5%.
        var second = await ledger.EarnAsync(Order(_user, 100m));
        Assert.Equal(5m, second!.Percent);
        Assert.Equal(5m, second.AmountUsd);

        var summary = await ledger.GetSummaryAsync(_user);
        Assert.Equal(12.50m, summary.AvailableUsd);
        Assert.Equal(350m, summary.QualifyingSpendUsd);
    }

    [Fact]
    public async Task Nothing_is_earned_when_the_programme_is_off()
    {
        var off = Ledger(new CashbackOptions { Enabled = false });
        Assert.Null(await off.EarnAsync(Order(_user, 100m)));
        Assert.Empty(await Ledger().GetEntriesAsync(_user));
    }

    [Fact]
    public async Task Legacy_unique_UserId_index_is_dropped_so_every_buyer_gets_an_account()
    {
        // Первая версия кэшбэка оставила на CashbackAccounts уникальный индекс по UserId. Нынешний счёт этого поля
        // не пишет, и второй же счёт падал на дубликате null — оплата кэшбэком отвечала 500.
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var accounts = database.GetCollection<MongoDB.Bson.BsonDocument>($"CashbackAccountsLegacy_{Guid.NewGuid():N}");
        await accounts.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
            new MongoDB.Bson.BsonDocument("UserId", 1),
            new CreateIndexOptions { Name = "ix_cashback_accounts_user", Unique = true }));
        await accounts.InsertOneAsync(new MongoDB.Bson.BsonDocument { { "_id", "first@taleshop.test" }, { "Version", 0L } });
        await Assert.ThrowsAsync<MongoWriteException>(() =>
            accounts.InsertOneAsync(new MongoDB.Bson.BsonDocument { { "_id", "second@taleshop.test" }, { "Version", 0L } }));

        await SuperBot.WebApi.Services.MongoDbInitializer.DropLegacyCashbackAccountIndexesAsync(accounts, NullLogger.Instance);
        await SuperBot.WebApi.Services.MongoDbInitializer.DropLegacyCashbackAccountIndexesAsync(accounts, NullLogger.Instance); // повтор безопасен

        await accounts.InsertOneAsync(new MongoDB.Bson.BsonDocument { { "_id", "second@taleshop.test" }, { "Version", 0L } });
        var names = (await (await accounts.Indexes.ListAsync()).ToListAsync()).Select(index => index["name"].AsString).ToList();
        Assert.Equal(new[] { "_id_" }, names);
        await database.DropCollectionAsync(accounts.CollectionNamespace.CollectionName);
    }

    [Fact]
    public async Task Pending_cashback_cannot_be_reserved()
    {
        var ledger = Ledger(new CashbackOptions { Enabled = true, PendingDays = 14 });
        await ledger.EarnAsync(Order(_user, 100m));

        Assert.Equal(0m, await ledger.ReserveAsync(_user, $"pi_{Guid.NewGuid():N}", 3m));
        Assert.Equal(3m, (await ledger.GetSummaryAsync(_user)).PendingUsd);
    }

    [Fact]
    public async Task Reserve_is_capped_changes_with_the_cart_and_is_released_or_committed()
    {
        var ledger = Ledger();
        await ledger.AdjustAsync(_user, 10m, "test balance", "test");
        var payment = $"pi_{Guid.NewGuid():N}";

        Assert.Equal(10m, await ledger.ReserveAsync(_user, payment, 25m));   // не больше баланса
        Assert.Equal(4m, await ledger.ReserveAsync(_user, payment, 4m));     // корзина подешевела
        var held = await ledger.GetSummaryAsync(_user);
        Assert.Equal(6m, held.AvailableUsd);
        Assert.Equal(4m, held.ReservedUsd);

        Assert.True(await ledger.ReleaseAsync(payment));
        Assert.False(await ledger.ReleaseAsync(payment));                    // второй раз нечего снимать
        Assert.Equal(10m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        var paid = $"pi_{Guid.NewGuid():N}";
        await ledger.ReserveAsync(_user, paid, 7m);
        Assert.True(await ledger.CommitAsync(paid, "order-1", "TS-1"));
        var after = await ledger.GetSummaryAsync(_user);
        Assert.Equal(3m, after.AvailableUsd);
        Assert.Equal(0m, after.ReservedUsd);
        Assert.Equal(7m, after.UsedAllTimeUsd);
        Assert.Equal(7m, await ledger.ReserveAsync(_user, paid, 1m));        // оплаченный резерв не меняется
    }

    [Fact]
    public async Task Concurrent_payments_never_spend_more_than_the_balance()
    {
        var ledger = Ledger();
        await ledger.AdjustAsync(_user, 10m, "test balance", "test");

        // Десять вкладок одновременно пытаются потратить весь баланс каждая.
        var reserved = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => Task.Run(() => Ledger().ReserveAsync(_user, $"pi_{Guid.NewGuid():N}", 10m))));

        Assert.Equal(10m, reserved.Sum());
        var summary = await ledger.GetSummaryAsync(_user);
        Assert.Equal(0m, summary.AvailableUsd);
        Assert.Equal(10m, summary.ReservedUsd);
    }

    [Fact]
    public async Task Refund_takes_back_earned_returns_spent_and_repeats_do_nothing()
    {
        var ledger = Ledger();
        await ledger.AdjustAsync(_user, 5m, "test balance", "test");

        // Заказ на $100: $5 оплачено кэшбэком, деньгами $95 — начислено 3% = $2.85.
        var payment = $"pi_{Guid.NewGuid():N}";
        await ledger.ReserveAsync(_user, payment, 5m);
        var order = Order(_user, 95m);
        await ledger.CommitAsync(payment, order.OrderId, "TS-2");
        await ledger.EarnAsync(order);
        Assert.Equal(2.85m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        var half = await ledger.ReverseOrderAsync(_user, order.OrderId, 0.5m);
        Assert.Equal(1.43m, half.ReversedUsd);
        Assert.Equal(2.50m, half.ReturnedUsd);

        var repeat = await ledger.ReverseOrderAsync(_user, order.OrderId, 0.5m);
        Assert.Equal(0m, repeat.ReversedUsd);
        Assert.Equal(0m, repeat.ReturnedUsd);

        var full = await ledger.ReverseOrderAsync(_user, order.OrderId, 1m);
        Assert.Equal(1.42m, full.ReversedUsd);
        Assert.Equal(2.50m, full.ReturnedUsd);

        var summary = await ledger.GetSummaryAsync(_user);
        Assert.Equal(5m, summary.AvailableUsd);   // кэшбэк за заказ забран, потраченное вернулось
        Assert.Equal(0m, summary.UsedAllTimeUsd);
        Assert.Equal(0m, summary.QualifyingSpendUsd);
    }

    [Fact]
    public async Task Refund_after_a_won_dispute_takes_the_cashback_back_again()
    {
        // Спор → сторно; спор выиграли → вернули; потом обычный возврат денег. Раньше ключ идемпотентности
        // второго сторно совпадал с первым, вставка отбрасывалась как дубликат, и кэшбэк оставался навсегда.
        var ledger = Ledger();
        var order = Order(_user, 100m);
        await ledger.EarnAsync(order);
        Assert.Equal(3m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        Assert.Equal(3m, (await ledger.ReverseOrderAsync(_user, order.OrderId, 1m, returnSpent: false)).ReversedUsd);
        Assert.Equal(0m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        Assert.Equal(3m, await ledger.RestoreOrderAsync(_user, order.OrderId, "dispute won"));
        Assert.Equal(3m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        var refund = await ledger.ReverseOrderAsync(_user, order.OrderId, 1m);
        Assert.Equal(3m, refund.ReversedUsd);
        Assert.Equal(0m, (await ledger.GetSummaryAsync(_user)).AvailableUsd);

        // Повтор при том же состоянии журнала — по-прежнему ничего.
        Assert.Equal(0m, (await ledger.ReverseOrderAsync(_user, order.OrderId, 1m)).ReversedUsd);
    }

    [Fact]
    public async Task Manual_adjustment_needs_a_reason()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => Ledger().AdjustAsync(_user, 5m, " ", "admin"));
    }

    private sealed class StaticOptions : IOptionsMonitor<CashbackOptions>
    {
        public StaticOptions(CashbackOptions value) => CurrentValue = value;
        public CashbackOptions CurrentValue { get; }
        public CashbackOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CashbackOptions, string?> listener) => null;
    }
}
