using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Подпись «чем оплачено» для заказа и писем. Раньше её не было: в деталях заказа лежал статус платежа в поле
/// «способ оплаты», а письмо о возврате обещало деньги «на карту», не говоря какую.
/// </summary>
public class PaymentInstrumentTests
{
    [Theory]
    [InlineData("visa", "4242", null, "Visa •••• 4242")]
    [InlineData("mastercard", "5556", null, "Mastercard •••• 5556")]
    [InlineData("amex", "0005", null, "American Express •••• 0005")]
    [InlineData("visa", "4242", "apple_pay", "Apple Pay · Visa •••• 4242")]
    [InlineData("visa", "4242", "google_pay", "Google Pay · Visa •••• 4242")]
    [InlineData("cartes_bancaires", "1234", null, "Cartes Bancaires •••• 1234")]
    [InlineData("somethingnew", "9999", null, "Somethingnew •••• 9999")]
    [InlineData(null, null, null, "Card")]
    public void Describes_a_stripe_card_the_way_the_buyer_knows_it(string? brand, string? last4, string? wallet, string expected)
    {
        var order = new Order { PaymentProvider = "stripe", PaidWithType = "card", PaidWithBrand = brand, PaidWithLast4 = last4, PaidWithWallet = wallet };
        Assert.Equal(expected, PaymentInstrument.Describe(order));
    }

    [Fact]
    public void Names_non_card_methods_plainly()
    {
        Assert.Equal("PayPal", PaymentInstrument.Describe(new Order { PaymentProvider = "stripe", PaidWithType = "paypal" }));
        Assert.Equal("Link", PaymentInstrument.Describe(new Order { PaymentProvider = "stripe", PaidWithType = "link" }));
        Assert.Equal("Sepa debit", PaymentInstrument.Describe(new Order { PaymentProvider = "stripe", PaidWithType = "sepa_debit" }));
        Assert.Equal("Bitcoin", PaymentInstrument.Describe(new Order { PaymentProvider = "btcpay" }));
        Assert.Equal("Telegram Stars", PaymentInstrument.Describe(new Order { PaymentProvider = "stars" }));
        // Старые заказы Stripe без деталей платежа — просто «Card», как и раньше в чеке.
        Assert.Equal("Card", PaymentInstrument.Describe(new Order { PaymentProvider = "stripe" }));
    }
}
