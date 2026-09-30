using SuperBot.Core.Cashback;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Пересчёт баланса кэшбэка из журнала. Это место, где решается, сколько денег у покупателя,
/// поэтому здесь проверены все договорённости: ожидание, сгорание, возвраты, «не ниже нуля».
/// </summary>
public class CashbackProjectionTests
{
    private static readonly DateTime T0 = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);
    private int _seq;

    private CashbackEntry Earn(decimal amount, DateTime at, string orderId, decimal orderTotal = 100m, int pendingDays = 14, int expiryMonths = 12) => new()
    {
        Id = $"e{_seq++}",
        Type = CashbackEntryTypes.Earn,
        AmountUsd = amount,
        OrderId = orderId,
        OrderTotalUsd = orderTotal,
        CreatedAt = at,
        UnlocksAt = at.AddDays(pendingDays),
        ExpiresAt = expiryMonths > 0 ? at.AddMonths(expiryMonths) : null,
        IdempotencyKey = $"earn:{orderId}"
    };

    private CashbackEntry Spend(decimal amount, DateTime at, string status = CashbackSpendStatuses.Committed, string? orderId = null) => new()
    {
        Id = $"s{_seq++}",
        Type = CashbackEntryTypes.Spend,
        AmountUsd = amount,
        Status = status,
        OrderId = orderId,
        CreatedAt = at,
        IdempotencyKey = $"spend:{_seq}"
    };

    private CashbackEntry Reversal(decimal amount, DateTime at, string orderId, decimal orderTotal = 0m) => new()
    {
        Id = $"r{_seq++}",
        Type = CashbackEntryTypes.Reversal,
        AmountUsd = amount,
        OrderId = orderId,
        OrderTotalUsd = orderTotal,
        CreatedAt = at,
        IdempotencyKey = $"reversal:{_seq}"
    };

    [Fact]
    public void Earned_cashback_waits_out_the_pending_period()
    {
        var entries = new[] { Earn(5m, T0, "o1") };

        var during = CashbackProjection.Project(entries, T0.AddDays(13));
        Assert.Equal(5m, during.PendingUsd);
        Assert.Equal(0m, during.AvailableUsd);
        Assert.Equal(T0.AddDays(14), during.NextUnlockAt);
        Assert.Equal("pending", during.Earns["e0"].State);

        var after = CashbackProjection.Project(entries, T0.AddDays(14));
        Assert.Equal(0m, after.PendingUsd);
        Assert.Equal(5m, after.AvailableUsd);
        Assert.Null(after.NextUnlockAt);
        Assert.Equal("available", after.Earns["e0"].State);
    }

    [Fact]
    public void Reserved_spend_is_held_and_released_spend_is_ignored()
    {
        var entries = new[]
        {
            Earn(10m, T0, "o1"),
            Spend(4m, T0.AddDays(15), CashbackSpendStatuses.Reserved),
            Spend(3m, T0.AddDays(16), CashbackSpendStatuses.Released)
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(20));
        Assert.Equal(6m, summary.AvailableUsd);
        Assert.Equal(4m, summary.ReservedUsd);
        Assert.Equal(0m, summary.UsedAllTimeUsd);
    }

    [Fact]
    public void Refund_of_a_pending_order_takes_its_cashback_and_its_spend_from_the_level()
    {
        var entries = new[]
        {
            Earn(5m, T0, "o1", orderTotal: 100m),
            Reversal(5m, T0.AddDays(2), "o1", orderTotal: 100m)
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(30));
        Assert.Equal(0m, summary.PendingUsd);
        Assert.Equal(0m, summary.AvailableUsd);
        Assert.Equal(0m, summary.EarnedAllTimeUsd);
        Assert.Equal(0m, summary.QualifyingSpendUsd);
        Assert.Equal("reverted", summary.Earns["e0"].State);
    }

    [Fact]
    public void Refund_after_the_cashback_was_spent_never_takes_the_balance_below_zero()
    {
        var entries = new[]
        {
            Earn(10m, T0, "o1"),
            Earn(2m, T0.AddDays(1), "o2"),
            Spend(9m, T0.AddDays(20)),
            Reversal(10m, T0.AddDays(21), "o1")
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(22));
        // Было 12, потратили 9 — осталось 3. Забрать нужно 10: забираем 3, остальное прощаем.
        Assert.Equal(0m, summary.AvailableUsd);
        Assert.Equal(7m, summary.ForgivenAllTimeUsd);
        Assert.Equal(2m, summary.EarnedAllTimeUsd);
    }

    [Fact]
    public void Partial_refund_takes_back_a_proportional_part()
    {
        var entries = new[]
        {
            Earn(6m, T0, "o1", orderTotal: 120m),
            Reversal(3m, T0.AddDays(15), "o1", orderTotal: 60m)
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(16));
        Assert.Equal(3m, summary.AvailableUsd);
        Assert.Equal(60m, summary.QualifyingSpendUsd);
    }

    [Fact]
    public void Unspent_cashback_expires_and_spending_uses_the_oldest_first()
    {
        var entries = new[]
        {
            Earn(5m, T0, "old"),
            Earn(5m, T0.AddMonths(6), "new"),
            // Трата после разблокировки обоих: должна уйти из старого, который сгорит раньше.
            Spend(4m, T0.AddMonths(7))
        };

        var summary = CashbackProjection.Project(entries, T0.AddMonths(12).AddDays(1));
        // У старого остался 1 — он сгорел; новый нетронут.
        Assert.Equal(5m, summary.AvailableUsd);
        Assert.Equal(1m, summary.ExpiredAllTimeUsd);
        Assert.Equal("expired", summary.Earns["e0"].State);
        Assert.Equal("available", summary.Earns["e1"].State);
    }

    [Fact]
    public void Cashback_spent_on_a_refunded_order_comes_back_to_the_balance()
    {
        var entries = new List<CashbackEntry>
        {
            Earn(10m, T0, "o1"),
            Spend(10m, T0.AddDays(15), orderId: "o2"),
            new()
            {
                Id = "ret",
                Type = CashbackEntryTypes.Return,
                AmountUsd = 10m,
                OrderId = "o2",
                CreatedAt = T0.AddDays(16),
                ExpiresAt = T0.AddDays(16).AddMonths(12),
                IdempotencyKey = "return:o2"
            }
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(17));
        Assert.Equal(10m, summary.AvailableUsd);
        Assert.Equal(0m, summary.UsedAllTimeUsd);
    }

    [Fact]
    public void Manual_deduction_is_capped_at_the_available_balance()
    {
        var entries = new List<CashbackEntry>
        {
            Earn(3m, T0, "o1", pendingDays: 0),
            new() { Id = "adj", Type = CashbackEntryTypes.Adjust, AmountUsd = -5m, CreatedAt = T0.AddDays(1), IdempotencyKey = "adjust:1" }
        };

        var summary = CashbackProjection.Project(entries, T0.AddDays(2));
        Assert.Equal(0m, summary.AvailableUsd);
        Assert.Equal(2m, summary.ForgivenAllTimeUsd);
    }

    [Fact]
    public void Entries_from_the_future_are_not_applied()
    {
        var summary = CashbackProjection.Project(new[] { Earn(5m, T0.AddDays(1), "o1") }, T0);
        Assert.Equal(0m, summary.PendingUsd);
        Assert.Equal(0m, summary.EarnedAllTimeUsd);
    }

    [Theory]
    [InlineData(0, "rookie")]
    [InlineData(199.99, "rookie")]
    [InlineData(200, "veteran")]
    [InlineData(999, "veteran")]
    [InlineData(1000, "elite")]
    [InlineData(3000, "legend")]
    public void Tier_follows_the_default_thresholds(decimal spend, string tier)
    {
        Assert.Equal(tier, new CashbackOptions().TierFor(spend).Id);
    }

    [Fact]
    public void Won_dispute_gives_back_only_what_was_actually_taken()
    {
        // $10 начислено и потрачено целиком; спор забрал бы $10, но на балансе было $2 — $8 простили.
        var entries = new List<CashbackEntry>
        {
            Earn(10m, T0, "o1", orderTotal: 100m),
            Earn(2m, T0, "o2", orderTotal: 20m),
            Spend(10m, T0.AddDays(15)),
            Reversal(10m, T0.AddDays(20), "o1", orderTotal: 100m)
        };
        var disputed = CashbackProjection.Project(entries, T0.AddDays(21));
        Assert.Equal(0m, disputed.AvailableUsd);
        Assert.Equal(8m, disputed.ForgivenAllTimeUsd);

        // Спор выигран: отмена забранного. Вернуть можно только реально взятые $2, прощённое просто перестаёт им быть.
        entries.Add(Reversal(-10m, T0.AddDays(30), "o1", orderTotal: -100m));
        var won = CashbackProjection.Project(entries, T0.AddDays(31));
        Assert.Equal(2m, won.AvailableUsd);
        Assert.Equal(0m, won.ForgivenAllTimeUsd);
        Assert.Equal(12m, won.EarnedAllTimeUsd);
        Assert.Equal(120m, won.QualifyingSpendUsd);
        // Возвращённые $2 лежат в той же партии начисления — оно снова «на балансе».
        Assert.Equal("available", won.Earns["e0"].State);
        Assert.Equal(2m, won.Earns["e0"].RemainingUsd);
    }

    [Fact]
    public void Lots_show_what_is_left_of_each_credit_and_when_it_expires()
    {
        var entries = new[]
        {
            Earn(5m, T0, "old"),
            Earn(5m, T0.AddMonths(6), "new"),
            Spend(4m, T0.AddMonths(7))
        };

        var summary = CashbackProjection.Project(entries, T0.AddMonths(8));
        var old = summary.Lots.Single(lot => lot.Key == "e0");
        Assert.Equal(1m, old.RemainingUsd);                    // трата ушла из старого
        Assert.Equal(T0.AddMonths(12), old.ExpiresAt);
        Assert.True(old.IsEarn && old.Unlocked);
        Assert.Equal(5m, summary.Lots.Single(lot => lot.Key == "e1").RemainingUsd);
    }

    [Fact]
    public void Programme_is_on_by_default()
    {
        // Даты запуска нет: программа включена по умолчанию и работает для любого заказа.
        Assert.True(new CashbackOptions().Enabled);
    }
}
