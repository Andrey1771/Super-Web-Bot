using SuperBot.Core.Entities;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.Storefront;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Полка «Popular this week» всегда полная: продажи недели, потом месяца, потом добор играми в наличии с лучшим
/// рейтингом. Добор ротируется по дате, а не случайно: главная не должна прыгать при каждом обновлении.
/// </summary>
public class PopularShelfTests
{
    private static CatalogItem Item(string id, double? rating = null, int reviews = 0, bool inStock = true) => new(
        Id: id, Slug: id, Name: id, Title: id, Description: "", GameType: default, Category: "Action",
        ImagePath: "", CoverMediaId: null, ReleaseDate: DateTime.UtcNow.AddDays(-30), IsComingSoon: false, Price: 10m, FinalPrice: 10m,
        Currency: "USD", Prices: new Dictionary<string, decimal>(), DiscountPercent: null, DiscountActive: false, DiscountEndsAt: null,
        Genres: Array.Empty<string>(), Platforms: Array.Empty<string>(), Rating: rating, ReviewCount: reviews, InStock: inStock, LowStockLeft: null,
        KeysAvailable: 0, KeysDelivered: 0, LowStockThreshold: null, ShowInFeaturedStorefront: false, FeaturedStorefrontPriority: 0);

    private static readonly DateTime Today = new(2026, 9, 25);

    [Fact]
    public void Real_sales_come_first_then_month_sales_then_the_best_rated_in_stock()
    {
        var released = new[]
        {
            Item("week-hit"), Item("month-hit"), Item("top-rated", rating: 4.9, reviews: 120), Item("well-known", rating: 4.5, reviews: 500),
            Item("sold-out", rating: 5.0, reviews: 999, inStock: false), Item("no-reviews")
        };
        var chart = new[]
        {
            new GameController.WeeklyChartEntry("week-hit", Sold: 3, SoldLast30Days: 3),
            new GameController.WeeklyChartEntry("month-hit", Sold: 0, SoldLast30Days: 7),
            new GameController.WeeklyChartEntry("gone-from-catalog", Sold: 9, SoldLast30Days: 9)
        };

        var shelf = PopularShelf.Build(chart, released, capacity: 5, Today);

        Assert.Equal(new[] { "week-hit", "month-hit" }, shelf.Items.Take(2).Select(item => item.Id));
        Assert.Equal(1, shelf.SoldThisWeek);                                  // только week-hit продавался на этой неделе
        Assert.Equal(5, shelf.Items.Count);
        Assert.Equal(shelf.Items.Count, shelf.Items.Select(item => item.Id).Distinct().Count());
        // Распроданная игра — в самом конце добора, даже с лучшим рейтингом.
        Assert.True(shelf.Items.ToList().FindIndex(item => item.Id == "sold-out") > shelf.Items.ToList().FindIndex(item => item.Id == "no-reviews") || !shelf.Items.Any(item => item.Id == "sold-out"));
    }

    [Fact]
    public void Fill_rotates_by_day_but_stays_the_same_within_a_day()
    {
        var released = Enumerable.Range(1, 6).Select(i => Item($"g{i}", rating: 4.0, reviews: 10)).ToList();
        var chart = Array.Empty<GameController.WeeklyChartEntry>();

        var morning = PopularShelf.Build(chart, released, capacity: 3, Today.AddHours(9));
        var evening = PopularShelf.Build(chart, released, capacity: 3, Today.AddHours(21));
        var tomorrow = PopularShelf.Build(chart, released, capacity: 3, Today.AddDays(1));

        Assert.Equal(morning.Items.Select(item => item.Id), evening.Items.Select(item => item.Id));
        Assert.NotEqual(morning.Items.Select(item => item.Id), tomorrow.Items.Select(item => item.Id));
        Assert.Equal(0, morning.SoldThisWeek);
        Assert.Equal(3, morning.Items.Count);
    }

    [Fact]
    public void Never_exceeds_capacity_and_copes_with_a_tiny_catalog()
    {
        var released = new[] { Item("only-one") };
        var chart = new[] { new GameController.WeeklyChartEntry("only-one", Sold: 1, SoldLast30Days: 1) };

        var shelf = PopularShelf.Build(chart, released, capacity: 8, Today);

        Assert.Single(shelf.Items);
        Assert.Equal(1, shelf.SoldThisWeek);
        Assert.Empty(PopularShelf.Build(chart, Array.Empty<CatalogItem>(), capacity: 8, Today).Items);
    }
}
