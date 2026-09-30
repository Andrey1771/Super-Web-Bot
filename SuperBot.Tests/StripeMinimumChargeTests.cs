using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Минимум платежа Stripe проверяется в валюте выплат аккаунта. У аккаунта в евро платёж $0.50 отклоняется
/// («$0.50 converts to approximately €0.44»), поэтому кассе нужен порог, переведённый в валюту заказа.
/// </summary>
public class StripeMinimumChargeTests
{
    private static readonly FxRateBook Rates = new("USD", new[]
    {
        new FxRate("USD", "EUR", 0.87m, DateTime.UtcNow),
        new FxRate("USD", "GBP", 0.75m, DateTime.UtcNow)
    });

    [Fact]
    public void Same_currency_uses_the_table()
    {
        Assert.Equal(0.50m, StripeMinimumCharge.For("USD", "USD", Rates));
        Assert.Equal(0.30m, StripeMinimumCharge.For("GBP", null, Rates));
    }

    [Fact]
    public void Dollar_order_on_a_euro_account_needs_more_than_fifty_cents()
    {
        // €0.50 / 0.87 = $0.5747; с запасом 10% — $0.6322, вверх до цента — $0.64.
        var minimum = StripeMinimumCharge.For("USD", "EUR", Rates);
        Assert.Equal(0.64m, minimum);
        // По курсу из ошибки Stripe ($0.50 = €0.44) этого хватает: $0.64 ≈ €0.563.
        Assert.True(minimum * 0.88m >= 0.50m);
    }

    [Fact]
    public void Never_below_the_own_minimum_of_the_order_currency()
    {
        // £0.30 в долларах — около $0.40 с запасом, но доллар сам по себе требует $0.50.
        Assert.Equal(0.50m, StripeMinimumCharge.For("USD", "GBP", Rates));
    }

    [Fact]
    public void Missing_rate_doubles_the_own_minimum()
    {
        Assert.Equal(1.00m, StripeMinimumCharge.For("USD", "CHF", Rates));
        Assert.Equal(1.00m, StripeMinimumCharge.For("USD", "EUR", null));
    }
}
