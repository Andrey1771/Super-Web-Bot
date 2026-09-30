using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Возврат по позиции. Главное: при оплате кэшбэком деньги на карте не отражают долю заказа, поэтому кэшбэк и налог
/// считаются по точной доле стоимости, а на карту уходит часть списанного, округлённая вниз — остаток забирает
/// последняя позиция.
/// </summary>
public class OrderRefundsTests
{
    private static decimal FloorCents(decimal amount) => Math.Floor(amount * 100m) / 100m;

    private static Order CashbackOrder() => new()
    {
        Status = "DELIVERED",
        PaymentStatus = "PAID",
        Currency = "USD",
        CashbackApplied = 246.77m,
        TotalAmount = 1.00m,
        Totals = new MoneyTotals { Total = 1.00m },
        Items = new List<OrderItemSnapshot>
        {
            new() { ItemId = "a", Title = "Cities: Skylines II", Quantity = 1, LineTotal = 49.99m },
            new() { ItemId = "b", Title = "wds", Quantity = 2, LineTotal = 197.78m }
        }
    };

    [Fact]
    public void Item_paid_mostly_with_cashback_sends_its_card_share_and_keeps_the_exact_order_share()
    {
        var order = CashbackOrder();

        var plan = OrderRefunds.Plan(order, order.Items[0], 1, FloorCents)!;

        Assert.Equal(49.99m, plan.LineValue);
        Assert.Equal(0.20m, plan.ToCard);                          // $1.00 × 20.18%, вниз до цента
        Assert.Equal(49.99m / 247.77m, plan.Share);                // кэшбэк — по точной доле, а не по 20 центам
        Assert.False(plan.AllItemsRefunded);
    }

    [Fact]
    public void Card_amounts_follow_the_running_share_and_the_last_item_takes_the_remainder()
    {
        var order = CashbackOrder();
        var first = OrderRefunds.Plan(order, order.Items[1], 1, FloorCents)!;   // одна из двух штук
        Apply(order, order.Items[1], 1, first);
        Assert.Equal(0.39m, first.ToCard);                          // $98.89 из $247.77 → 39.9% → $0.39

        var second = OrderRefunds.Plan(order, order.Items[0], 1, FloorCents)!;
        Apply(order, order.Items[0], 1, second);
        Assert.Equal(0.21m, second.ToCard);                         // накопленные 60.09% → $0.60, минус уже $0.39

        var last = OrderRefunds.Plan(order, order.Items[1], 1, FloorCents)!;
        Assert.True(last.AllItemsRefunded);
        Assert.Equal(1m, last.Share);
        Assert.Equal(0.40m, last.ToCard);                           // ровно остаток: всего $1.00
    }

    [Fact]
    public void Cannot_refund_more_than_is_left()
    {
        var order = CashbackOrder();
        order.Items[1].RefundedQuantity = 2;

        Assert.Null(OrderRefunds.Plan(order, order.Items[1], 1, FloorCents));
        Assert.Null(OrderRefunds.Plan(order, order.Items[0], 2, FloorCents));
        Assert.Null(OrderRefunds.Plan(order, order.Items[0], 0, FloorCents));
    }

    [Fact]
    public void Fraction_takes_the_larger_of_money_and_item_share()
    {
        var order = CashbackOrder();
        Assert.Equal(0m, OrderRefunds.Fraction(order));

        order.RefundedAmount = 0.20m;                                // на карту ушло 20 центов из $247.77
        order.RefundedShare = 0.2018m;                               // по позициям — пятая часть заказа
        Assert.Equal(0.2018m, OrderRefunds.Fraction(order));

        order.PaymentStatus = "REFUNDED";
        Assert.Equal(1m, OrderRefunds.Fraction(order));
    }

    [Fact]
    public void Money_only_refund_is_measured_against_the_whole_order_not_the_card()
    {
        // $0.50 из кабинета Stripe на заказе, где карта заплатила $1.00 из $247.77: это 0.2% заказа, а не половина —
        // иначе покупателю вернулась бы половина потраченного кэшбэка и сторнировалась половина налога.
        var order = CashbackOrder();
        order.RefundedAmount = 0.50m;
        Assert.Equal(0.50m / 247.77m, OrderRefunds.Fraction(order));

        // Без кэшбэка стоимость заказа и есть карта: четверть денег — четверть заказа.
        var cardOnly = new Order { Status = "DELIVERED", PaymentStatus = "PAID", TotalAmount = 40m, Totals = new MoneyTotals { Total = 40m }, RefundedAmount = 10m };
        Assert.Equal(0.25m, OrderRefunds.Fraction(cardOnly));
    }

    private static void Apply(Order order, OrderItemSnapshot item, int quantity, ItemRefundPlan plan)
    {
        item.RefundedQuantity += quantity;
        order.RefundedShare = plan.Share;
        order.RefundedAmount = (order.RefundedAmount ?? 0m) + plan.ToCard;
    }
}
