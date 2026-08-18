using SuperBot.Core.Entities;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Приведение каталога к валюте покупателя. Главное правило: позиция, у которой в этой валюте
/// цены нет, из выдачи уходит. Показать цену, которую нельзя списать, — это ровно то расхождение
/// витрины и чекаута, ради устранения которого затевалась вся работа.
///
/// Чистые вызовы без поднятия приложения: тут считается арифметика, а не маршруты.
/// </summary>
public class CatalogPricingTests
{
    private static CatalogItem Item(
        decimal price,
        string currency = "USD",
        decimal? discountPercent = null,
        Dictionary<string, decimal>? prices = null) =>
        new(
            Id: "game-1",
            Slug: "game",
            Name: "Game",
            Title: "Game",
            Description: "",
            GameType: GameType.Action,
            Category: "Action",
            ImagePath: "cover.png",
            CoverMediaId: null,
            ReleaseDate: DateTime.UtcNow.AddYears(-1),
            IsComingSoon: false,
            Price: price,
            FinalPrice: discountPercent is null ? price : price * (1 - discountPercent.Value / 100m),
            Currency: currency,
            Prices: prices ?? new Dictionary<string, decimal>(),
            DiscountPercent: discountPercent,
            DiscountActive: discountPercent is not null,
            DiscountEndsAt: null,
            Genres: new[] { "Action" },
            Platforms: new[] { "PC" },
            Rating: null,
            ReviewCount: 0,
            InStock: true,
            LowStockLeft: null,
            ShowInFeaturedStorefront: false,
            FeaturedStorefrontPriority: int.MaxValue);

    [Fact]
    public void BaseCurrency_itemIsReturnedAsIs()
    {
        var item = Item(59.99m);

        Assert.Same(item, CatalogPricing.InCurrency(item, "USD"));
    }

    [Fact]
    public void ListedCurrency_usesManualPrice()
    {
        var item = Item(59.99m, prices: new Dictionary<string, decimal> { ["EUR"] = 54.99m });

        var converted = CatalogPricing.InCurrency(item, "EUR");

        Assert.NotNull(converted);
        Assert.Equal(54.99m, converted!.Price);
        Assert.Equal("EUR", converted.Currency);
    }

    [Fact]
    public void Discount_isAppliedToThePriceOfThatCurrency()
    {
        // Скидка — процент, она валютно-нейтральна. Но применяться должна к цене в евро,
        // иначе итоговая цена приехала бы из долларов.
        var item = Item(60m, discountPercent: 25m, prices: new Dictionary<string, decimal> { ["EUR"] = 40m });

        var converted = CatalogPricing.InCurrency(item, "EUR");

        Assert.Equal(40m, converted!.Price);
        Assert.Equal(30m, converted.FinalPrice);
    }

    [Fact]
    public void UnlistedCurrency_itemIsDropped()
    {
        var item = Item(59.99m, prices: new Dictionary<string, decimal> { ["EUR"] = 54.99m });

        Assert.Null(CatalogPricing.InCurrency(item, "JPY"));
    }

    [Fact]
    public void Catalog_keepsOnlyWhatCanBeSoldInThatCurrency()
    {
        var catalog = new[]
        {
            Item(59.99m, prices: new Dictionary<string, decimal> { ["EUR"] = 54.99m }) with { Id = "with-eur" },
            Item(19.99m) with { Id = "usd-only" }
        };

        var inEuro = CatalogPricing.InCurrency(catalog, "EUR");

        Assert.Equal("with-eur", Assert.Single(inEuro).Id);
    }

    [Fact]
    public void PriceListKeys_ignoreCaseAndSpaces()
    {
        var item = Item(59.99m, prices: new Dictionary<string, decimal> { [" eur "] = 54.99m });

        Assert.Equal(54.99m, CatalogPricing.InCurrency(item, "EUR")!.Price);
    }
}
