using SuperBot.Infrastructure.Services;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Строки для Stripe Tax: промокод на заказ раскладывается по строкам так, чтобы сумма строк совпала с итогом
/// до копейки, — иначе налоговая транзакция разойдётся с тем, что заплатил покупатель.
/// </summary>
public class OrderTaxAllocationTests
{
    [Fact]
    public void Promo_is_spread_proportionally_and_the_lines_add_up_to_the_total()
    {
        Assert.Equal(new long[] { 750, 2250 }, OrderTaxService.Allocate(new long[] { 1000, 3000 }, 3000));

        var uneven = OrderTaxService.Allocate(new long[] { 333, 333, 334 }, 500);
        Assert.Equal(500, uneven.Sum());
        Assert.All(uneven, share => Assert.InRange(share, 166, 168));
    }

    [Fact]
    public void Without_a_promo_the_lines_stay_as_they_are()
    {
        Assert.Equal(new long[] { 1999, 501 }, OrderTaxService.Allocate(new long[] { 1999, 501 }, 2500));
    }

    [Fact]
    public void Lines_fully_covered_by_a_discount_are_not_sent()
    {
        var draft = OrderTaxService.BuildDraft(new[]
        {
            new CheckoutLineItem { GameId = "a", Quantity = 1, LineTotal = 0m },
            new CheckoutLineItem { GameId = "b", Quantity = 2, LineTotal = 30m }
        }, 25m, "USD", new TaxOptions());

        var line = Assert.Single(draft.Lines);
        Assert.Equal(2500, line.AmountMinor);
        Assert.Equal(2, line.Quantity);
        Assert.Equal("2:b", line.Reference);
    }

    [Fact]
    public void Each_line_gets_the_tax_code_of_its_product_type()
    {
        // В одном заказе игра, ключ ПО и подписка: у каждой строки свой код, иначе ПО облагалось бы как игра.
        var options = new TaxOptions { SoftwareSubscriptionTaxCode = "txcd_sub_test" };
        var draft = OrderTaxService.BuildDraft(new[]
        {
            new CheckoutLineItem { GameId = "game", Quantity = 1, LineTotal = 20m, ProductType = SuperBot.Core.Entities.ProductTypes.Game },
            new CheckoutLineItem { GameId = "av", Quantity = 1, LineTotal = 30m, ProductType = SuperBot.Core.Entities.ProductTypes.Software },
            new CheckoutLineItem { GameId = "vpn", Quantity = 1, LineTotal = 5m, ProductType = SuperBot.Core.Entities.ProductTypes.SoftwareSubscription },
            new CheckoutLineItem { GameId = "legacy", Quantity = 1, LineTotal = 1m, ProductType = null! }
        }, 56m, "USD", options);

        Assert.Equal(new[] { "txcd_10201000", "txcd_10202000", "txcd_sub_test", "txcd_10201000" }, draft.Lines.Select(item => item.TaxCode));
    }

    [Theory]
    [InlineData("8.8.8.8", true)]
    [InlineData("2a00:1450:4001:80b::200e", true)]
    [InlineData("127.0.0.1", false)]
    [InlineData("172.18.0.5", false)]
    [InlineData("192.168.1.10", false)]
    [InlineData("10.0.0.1", false)]
    [InlineData("::1", false)]
    [InlineData("::ffff:172.18.0.5", false)]
    [InlineData("not-an-ip", false)]
    [InlineData(null, false)]
    public void Only_public_addresses_are_used_to_locate_the_buyer(string? ip, bool expected)
    {
        Assert.Equal(expected, OrderTaxService.IsPublicIp(ip));
    }
}
