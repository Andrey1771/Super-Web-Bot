using SuperBot.Core.Entities;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Каталог с ПО: разделы не смешиваются, у ПО цена карточки — самая дешёвая подходящая лицензия, а срок и устройства
/// проверяются на одной лицензии. Чистые вызовы: здесь отбор и арифметика, а не маршруты.
/// </summary>
public class SoftwareCatalogQueryTests
{
    private static readonly IReadOnlyDictionary<string, int> NoRank = new Dictionary<string, int>();

    private static CatalogItem Item(string id, ProductKind kind = ProductKind.Game, decimal price = 20m) =>
        new(
            Id: id,
            Slug: id,
            Name: id,
            Title: id,
            Description: "",
            GameType: GameType.Action,
            Category: "Action",
            ImagePath: "cover.png",
            CoverMediaId: null,
            ReleaseDate: DateTime.UtcNow.AddYears(-1),
            IsComingSoon: false,
            Price: price,
            FinalPrice: price,
            Currency: "USD",
            Prices: new Dictionary<string, decimal>(),
            DiscountPercent: null,
            DiscountActive: false,
            DiscountEndsAt: null,
            Genres: Array.Empty<string>(),
            Platforms: new[] { "Windows" },
            Rating: null,
            ReviewCount: 0,
            KeysAvailable: 1,
            KeysDelivered: 0,
            LowStockThreshold: null,
            InStock: true,
            LowStockLeft: null,
            ShowInFeaturedStorefront: false,
            FeaturedStorefrontPriority: int.MaxValue,
            Kind: kind);

    private static CatalogLicense License(string code, decimal price, int? months, int? devices, bool inStock = true,
        decimal? discount = null, Dictionary<string, decimal>? prices = null, bool subscription = false) =>
        new(code, code, SoftwareCatalog.LicenseLabel(new GameEdition { LicenseTermMonths = months, LicenseDevices = devices, IsSubscription = subscription }),
            months, devices, subscription, IsDefault: false, price, discount is null ? price : price * (1 - discount.Value / 100m),
            prices ?? new Dictionary<string, decimal>(), discount, OwnDiscount: discount is not null, DiscountEndsAt: null, inStock);

    /// <summary>Антивирус: 1 год — 1 и 3 устройства, 2 года — 3 устройства, бессрочная на 10 устройств (нет на складе).</summary>
    private static CatalogItem Antivirus(string id = "nova", string category = "security") =>
        SoftwareLicenses.Represent(Item(id, ProductKind.Software) with
        {
            SoftwareCategory = category,
            Activation = SoftwareActivationTarget.VendorWebsite,
            Licenses = new[]
            {
                License("1y-3", 29.99m, 12, 3),
                License("1y-1", 19.99m, 12, 1),
                License("2y-3", 47.99m, 24, 3),
                License("life-10", 9.99m, null, 10, inStock: false)
            }
        });

    private static CatalogQueryOptions Options(ProductKind? kind = ProductKind.Game, string[]? terms = null, string[]? devices = null,
        string? category = null, string sort = "price-asc", string? search = null, string[]? activation = null) =>
        new(search, Array.Empty<string>(), null, null, Array.Empty<string>(), null, null, false, false, false, sort, 1, 24,
            Kind: kind, SoftwareCategory: category, LicenseTerms: terms, Devices: devices, Activation: activation);

    [Fact]
    public void Sections_do_not_mix_and_the_default_is_games()
    {
        var catalog = new[] { Item("elden-ring"), Antivirus() };

        Assert.Equal("elden-ring", Assert.Single(CatalogQuery.Apply(catalog, Options(), NoRank).Items).Id);
        Assert.Equal("nova", Assert.Single(CatalogQuery.Apply(catalog, Options(ProductKind.Software), NoRank).Items).Id);
        Assert.Equal(2, CatalogQuery.Apply(catalog, Options(kind: null), NoRank).Total);
        Assert.Equal(1, CatalogQuery.Count(catalog, Options()));
    }

    [Fact]
    public void Genre_filter_and_genre_facet_are_about_games_only()
    {
        // Раньше у ПО «категорией» был подставной жанр Action: программы считались в фасете жанра и попадали в его выдачу.
        var catalog = new[] { Item("elden-ring"), Antivirus() with { Category = "Antivirus & security" } };
        var all = Options(kind: null);

        var facets = CatalogQuery.Apply(catalog, all, NoRank).Facets.Categories;
        Assert.Equal("Action", Assert.Single(facets).Value);
        Assert.Equal(1, facets[0].Count);

        var byGenre = all with { Categories = new[] { "Action" } };
        Assert.Equal("elden-ring", Assert.Single(CatalogQuery.Apply(catalog, byGenre, NoRank).Items).Id);
        Assert.Equal("elden-ring", Assert.Single(CatalogQuery.Apply(catalog, all with { CategorySlug = "action" }, NoRank).Items).Id);
    }

    [Fact]
    public void Shared_catalog_lists_game_platforms_only_while_software_mode_lists_systems()
    {
        // Игра под PC и Linux, программа под Windows и Linux: общий «Linux» не должен смешивать их.
        var catalog = new[] { Item("elden-ring") with { Platforms = new[] { "PC", "Linux" } }, Antivirus() with { Platforms = new[] { "Windows", "Linux" } } };

        var shared = CatalogQuery.Apply(catalog, Options(kind: null), NoRank).Facets.Platforms;
        Assert.Equal(new[] { "Linux", "PC" }, shared.Select(facet => facet.Value));
        Assert.All(shared, facet => Assert.Equal(1, facet.Count));
        var byLinux = Options(kind: null) with { Platforms = new[] { "Linux" } };
        Assert.Equal("elden-ring", Assert.Single(CatalogQuery.Apply(catalog, byLinux, NoRank).Items).Id);

        var systems = CatalogQuery.Apply(catalog, Options(ProductKind.Software), NoRank).Facets.Platforms;
        Assert.Equal(new[] { "Linux", "Windows" }, systems.Select(facet => facet.Value));
    }

    [Fact]
    public void Search_counts_matches_per_kind_for_the_shared_search_box()
    {
        var catalog = new[] { Item("nova-drift"), Antivirus("nova-security"), Antivirus("sentinel") };

        var kinds = CatalogQuery.Apply(catalog, Options(search: "nova"), NoRank).Facets.Kinds;

        Assert.Equal(1, kinds.Single(k => k.Value == "Game").Count);
        Assert.Equal(1, kinds.Single(k => k.Value == "Software").Count);
    }

    [Fact]
    public void Card_price_is_the_cheapest_license_in_stock()
    {
        // Бессрочная за $9.99 дешевле всех, но её нет на складе — «from» по ней обещал бы то, чего не купить.
        var item = Antivirus();

        Assert.Equal("1y-1", item.LicenseCode);
        Assert.Equal(19.99m, item.FinalPrice);
        Assert.True(item.InStock);
    }

    [Fact]
    public void Term_and_devices_must_match_on_the_same_license_and_set_the_card_price()
    {
        var catalog = new[] { Antivirus() };

        var threeDevicesOneYear = Assert.Single(CatalogQuery.Apply(catalog, Options(ProductKind.Software, terms: new[] { "12" }, devices: new[] { "3" }), NoRank).Items);
        Assert.Equal("1y-3", threeDevicesOneYear.LicenseCode);
        Assert.Equal(29.99m, threeDevicesOneYear.FinalPrice);

        // 2 года есть, 1 устройство есть — но не в одной лицензии.
        Assert.Empty(CatalogQuery.Apply(catalog, Options(ProductKind.Software, terms: new[] { "24" }, devices: new[] { "1" }), NoRank).Items);
    }

    [Fact]
    public void Price_sort_uses_the_license_price_shown_on_the_card()
    {
        var cheapVpn = SoftwareLicenses.Represent(Item("vpn", ProductKind.Software, price: 99m) with
        {
            Licenses = new[] { License("1m", 4.99m, 1, 5), License("2y-3", 59.99m, 24, 3) }
        });
        var catalog = new[] { Antivirus(), cheapVpn };

        var all = CatalogQuery.Apply(catalog, Options(ProductKind.Software), NoRank).Items.Select(item => item.Id);
        Assert.Equal(new[] { "vpn", "nova" }, all);

        // Под фильтром «3 устройства» у VPN остаётся только двухлетняя за $59.99 — и он уезжает вниз.
        var threeDevices = CatalogQuery.Apply(catalog, Options(ProductKind.Software, devices: new[] { "3" }), NoRank).Items.Select(item => item.Id);
        Assert.Equal(new[] { "nova", "vpn" }, threeDevices);
    }

    [Fact]
    public void License_facets_are_ordered_and_count_against_the_other_license_filter()
    {
        var facets = CatalogQuery.Apply(new[] { Antivirus() }, Options(ProductKind.Software, devices: new[] { "1" }), NoRank).Facets.Software;

        // Бессрочные — в конце, 10 устройств и больше — одной кнопкой.
        Assert.Equal(new[] { "12", "24", "lifetime" }, facets.LicenseTerms.Select(f => f.Value));
        Assert.Equal(new[] { "1", "3", "10+" }, facets.Devices.Select(f => f.Value));
        // При выбранном «1 устройство» двухлетней лицензии на одно устройство нет.
        Assert.Equal(1, facets.LicenseTerms.Single(f => f.Value == "12").Count);
        Assert.Equal(0, facets.LicenseTerms.Single(f => f.Value == "24").Count);
        // Счётчик устройств не сужается собственным выбором.
        Assert.Equal(1, facets.Devices.Single(f => f.Value == "3").Count);
    }

    [Fact]
    public void Category_and_activation_filter_with_counts()
    {
        var office = Antivirus("office-suite", "office") with { Activation = SoftwareActivationTarget.MicrosoftAccount };
        var catalog = new[] { Antivirus(), office };

        var result = CatalogQuery.Apply(catalog, Options(ProductKind.Software, category: "office"), NoRank);
        Assert.Equal("office-suite", Assert.Single(result.Items).Id);
        Assert.Equal(1, result.Facets.Software.Categories.Single(f => f.Value == "security").Count);

        var microsoft = CatalogQuery.Apply(catalog, Options(ProductKind.Software, activation: new[] { "MicrosoftAccount" }), NoRank);
        Assert.Equal("office-suite", Assert.Single(microsoft.Items).Id);
        Assert.Equal(new[] { "VendorWebsite", "MicrosoftAccount" }, microsoft.Facets.Software.Activation.Select(f => f.Value));
    }

    [Fact]
    public void Games_get_no_software_facets()
    {
        Assert.Same(SoftwareFacets.Empty, CatalogQuery.Apply(new[] { Item("elden-ring"), Antivirus() }, Options(), NoRank).Facets.Software);
    }

    [Fact]
    public void Currency_conversion_goes_through_licenses_and_drops_those_without_a_price()
    {
        var item = SoftwareLicenses.Represent(Item("nova", ProductKind.Software) with
        {
            Licenses = new[]
            {
                License("1y-1", 19.99m, 12, 1, discount: 50m, prices: new Dictionary<string, decimal> { ["EUR"] = 30m }),
                License("1y-3", 9.99m, 12, 3)
            }
        });

        var inEuro = CatalogPricing.InCurrency(item, "EUR");

        Assert.NotNull(inEuro);
        Assert.Equal("1y-1", Assert.Single(inEuro!.Licenses!).Code);
        Assert.Equal("EUR", inEuro.Currency);
        Assert.Equal(30m, inEuro.Price);
        Assert.Equal(15m, inEuro.FinalPrice);
        Assert.Equal(50m, inEuro.DiscountPercent);

        Assert.Null(CatalogPricing.InCurrency(item, "JPY"));
    }
}
