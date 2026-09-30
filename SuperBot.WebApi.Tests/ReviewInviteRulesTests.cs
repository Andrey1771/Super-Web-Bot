using SuperBot.Core.Entities;
using SuperBot.Core.Services;
using SuperBot.WebApi.Services.ReviewInvites;
using Xunit;

namespace SuperBot.WebApi.Tests;

public class ReviewInviteRulesTests
{
    private static readonly DateTime Now = new(2026, 9, 10, 12, 0, 0, DateTimeKind.Utc);
    private static readonly ReviewInviteOptions Options = new() { Enabled = true, DelayDays = 7, MaxAgeDays = 30 };
    private static readonly IReadOnlySet<string> NothingReviewed = new HashSet<string>(StringComparer.Ordinal);

    private static Order Order(
        int deliveredDaysAgo = 10,
        bool paid = true,
        string email = "buyer@example.com",
        params (string GameId, string? Slug)[] items)
    {
        (string GameId, string? Slug)[] source = items.Length == 0
            ? new (string, string?)[] { ("game-1", "half-life") }
            : items;

        var snapshot = source
            .Select(item => new OrderItemSnapshot
            {
                GameId = item.GameId,
                Slug = item.Slug,
                Title = item.GameId,
                Delivery = new DeliverySnapshot
                {
                    DeliveredAt = Now.AddDays(-deliveredDaysAgo),
                    Keys = { new DeliveredKey { KeyMasked = "AAA-***", DeliveredAt = Now.AddDays(-deliveredDaysAgo) } }
                }
            })
            .ToList();

        return new Order
        {
            Id = Guid.NewGuid(),
            IsPaid = paid,
            UserName = email,
            UserId = "user-1",
            Items = snapshot,
        };
    }

    private static ReviewInviteDecision Decide(
        Order order, bool invited = false, bool optedOut = false, IReadOnlySet<string>? reviewed = null) =>
        ReviewInviteRules.Decide(order, Now, Options, invited, optedOut, reviewed ?? NothingReviewed);

    [Fact]
    public void Sends_for_a_delivered_order_past_the_delay()
    {
        var decision = Decide(Order());
        Assert.True(decision.ShouldSend);
        Assert.Equal(new[] { "game-1" }, decision.GameIds);
    }

    [Fact]
    public void Waits_until_the_delay_has_passed()
    {
        Assert.Equal(ReviewInviteSkip.TooEarly, Decide(Order(deliveredDaysAgo: 3)).Skip);
    }

    [Fact]
    public void Does_not_write_about_ancient_orders()
    {
        Assert.Equal(ReviewInviteSkip.TooOld, Decide(Order(deliveredDaysAgo: 90)).Skip);
    }

    [Fact]
    public void Skips_orders_without_delivery()
    {
        var order = Order();
        order.Items[0].Delivery = null;
        Assert.Equal(ReviewInviteSkip.NotDelivered, Decide(order).Skip);
    }

    [Fact]
    public void Skips_unpaid_orders()
    {
        Assert.Equal(ReviewInviteSkip.NotDelivered, Decide(Order(paid: false)).Skip);
    }

    [Fact]
    public void Skips_when_there_is_no_address_to_write_to()
    {
        Assert.Equal(ReviewInviteSkip.NoEmail, Decide(Order(email: "legacy-user-id")).Skip);
    }

    [Fact]
    public void Opt_out_wins_over_everything_else()
    {
        Assert.Equal(ReviewInviteSkip.OptedOut, Decide(Order(), optedOut: true).Skip);
    }

    [Fact]
    public void Writes_once_per_order()
    {
        Assert.Equal(ReviewInviteSkip.AlreadyInvited, Decide(Order(), invited: true).Skip);
    }

    [Fact]
    public void Stays_quiet_when_every_game_is_already_reviewed()
    {
        var reviewed = new HashSet<string>(new[] { "game-1" }, StringComparer.Ordinal);
        Assert.Equal(ReviewInviteSkip.AlreadyReviewed, Decide(Order(), reviewed: reviewed).Skip);
    }

    [Fact]
    public void Asks_only_about_games_without_a_review_yet()
    {
        var order = Order(items: new[] { ("game-1", (string?)"half-life"), ("game-2", (string?)"portal") });
        var reviewed = new HashSet<string>(new[] { "game-1" }, StringComparer.Ordinal);

        var decision = Decide(order, reviewed: reviewed);

        Assert.True(decision.ShouldSend);
        Assert.Equal(new[] { "game-2" }, decision.GameIds);
    }

    [Fact]
    public void Skips_items_with_nowhere_to_link()
    {
        var order = Order(items: new[] { ("game-1", (string?)null) });
        Assert.Equal(ReviewInviteSkip.NothingToReview, Decide(order).Skip);
    }

    [Fact]
    public void Counts_the_delay_from_the_last_key_handed_out()
    {
        // Первая игра уехала девять дней назад, вторая — только вчера: неделя ещё не прошла.
        var order = Order();
        order.Items.Add(new OrderItemSnapshot
        {
            GameId = "game-2",
            Slug = "portal",
            Title = "Portal",
            Delivery = new DeliverySnapshot { DeliveredAt = Now.AddDays(-1) }
        });
        order.Items[0].Delivery!.DeliveredAt = Now.AddDays(-9);
        order.Items[0].Delivery!.Keys.Clear();

        Assert.Equal(ReviewInviteSkip.TooEarly, Decide(order).Skip);
    }
}

public class PurchasedGamesTests
{
    [Fact]
    public void Counts_every_item_of_a_paid_order_not_just_the_first()
    {
        // Раньше проверка стояла по order.GameId, куда попадает только первая позиция:
        // покупатель набора мог оценить только одну игру из трёх.
        var order = new Order
        {
            IsPaid = true,
            GameId = "game-1",
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = "game-1" },
                new() { GameId = "game-2" },
                new() { GameId = "game-3" },
            }
        };

        var purchased = PurchasedGames.From(new[] { order });

        Assert.Equal(3, purchased.Count);
        Assert.True(PurchasedGames.Contains(new[] { order }, "game-3"));
    }

    [Fact]
    public void Falls_back_to_the_legacy_field_when_the_order_has_no_items()
    {
        var order = new Order { IsPaid = true, GameId = "game-legacy", Items = new List<OrderItemSnapshot>() };
        Assert.True(PurchasedGames.Contains(new[] { order }, "game-legacy"));
    }

    [Fact]
    public void Ignores_unpaid_orders()
    {
        var order = new Order { IsPaid = false, GameId = "game-1", Items = new List<OrderItemSnapshot>() };
        Assert.False(PurchasedGames.Contains(new[] { order }, "game-1"));
    }

    [Fact]
    public void Empty_game_id_is_never_purchased()
    {
        var order = new Order { IsPaid = true, Items = new List<OrderItemSnapshot> { new() { GameId = "game-1" } } };
        Assert.False(PurchasedGames.Contains(new[] { order }, null));
        Assert.False(PurchasedGames.Contains(new[] { order }, " "));
    }
}
