using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Лицензии ПО живут в изданиях: срок × устройства (× подписка). Подпись лицензии — то, по чему покупатель различает
/// варианты на странице, в корзине и в кабинете, поэтому её правила зафиксированы здесь.
/// </summary>
public class SoftwareCatalogTests
{
    [Theory]
    [InlineData(12, 3, false, "1 year · 3 devices")]
    [InlineData(24, 1, false, "2 years · 1 device")]
    [InlineData(null, 1, false, "Lifetime · 1 device")]
    [InlineData(1, 5, true, "Subscription · 1 month · 5 devices")]
    [InlineData(18, null, false, "18 months")]
    [InlineData(null, null, true, "Subscription")]
    public void License_label_describes_term_devices_and_subscription(int? months, int? devices, bool subscription, string expected)
    {
        var edition = new GameEdition { LicenseTermMonths = months, LicenseDevices = devices, IsSubscription = subscription };
        Assert.Equal(expected, SoftwareCatalog.LicenseLabel(edition));
    }

    [Fact]
    public void Game_editions_have_no_license_label()
    {
        Assert.Null(SoftwareCatalog.LicenseLabel(new GameEdition { Title = "Deluxe" }));
        Assert.Null(SoftwareCatalog.LicenseLabel(null));
    }

    [Fact]
    public void Line_type_follows_kind_and_subscription()
    {
        Assert.Equal(ProductTypes.Game, ProductTypes.For(ProductKind.Game, new GameEdition { IsSubscription = true }));
        Assert.Equal(ProductTypes.Software, ProductTypes.For(ProductKind.Software, null));
        Assert.Equal(ProductTypes.SoftwareSubscription, ProductTypes.For(ProductKind.Software, new GameEdition { IsSubscription = true }));
        Assert.True(ProductTypes.IsSoftware(ProductTypes.SoftwareSubscription));
        Assert.False(ProductTypes.IsSoftware("Game"));
    }

    [Fact]
    public void Default_software_categories_have_unique_address_tags()
    {
        var tags = SoftwareCatalog.DefaultCategories.Select(category => category.Tag).ToList();
        Assert.Equal(6, tags.Count);
        Assert.Equal(tags.Count, tags.Distinct().Count());
        Assert.All(tags, tag => Assert.Matches("^[a-z-]+$", tag));
    }
}
