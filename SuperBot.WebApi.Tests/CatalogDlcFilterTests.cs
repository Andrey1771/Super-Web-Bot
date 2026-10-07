using SuperBot.Core.Entities;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>Фильтр «DLC» каталога: игры с дополнениями или сами дополнения, со счётчиками.</summary>
public class CatalogDlcFilterTests
{
    private static readonly IReadOnlyDictionary<string, int> NoRank = new Dictionary<string, int>();

    private static CatalogItem Item(string id, string? parent = null, string category = "Action") => new(
        id, id, id, id, "", GameType.Action, category, "", null, DateTime.UtcNow.AddYears(-1), false, 10m, 10m, "USD",
        new Dictionary<string, decimal>(), null, false, null, [], ["PC"], null, 0, true, null, 1, 0, null, false, 0,
        ParentGameId: parent);

    private static readonly IReadOnlyList<CatalogItem> Catalog = CatalogSnapshotService.WithDlcCounts(
    [
        Item("xcom"), Item("solo"), Item("rpg", category: "RPG"),
        Item("xcom-dlc-1", parent: "xcom"), Item("xcom-dlc-2", parent: "xcom"), Item("rpg-dlc", parent: "rpg", category: "RPG"),
    ]);

    private static CatalogPage Query(string? dlc, string? category = null) => CatalogQuery.Apply(
        Catalog,
        new(null, category is null ? [] : [category], null, null, [], null, null, false, false, false, "title-asc", 1, 24, Dlc: dlc),
        NoRank);

    [Fact]
    public void Shows_games_with_dlc_or_the_dlc_themselves()
    {
        Assert.Equal(new[] { "rpg", "solo", "xcom" }, Query(null).Items.Select(i => i.Id).OrderBy(x => x));
        Assert.Equal(new[] { "rpg", "xcom" }, Query(CatalogQuery.DlcHas).Items.Select(i => i.Id).OrderBy(x => x));
        Assert.Equal(new[] { "rpg-dlc", "xcom-dlc-1", "xcom-dlc-2" }, Query(CatalogQuery.DlcOnly).Items.Select(i => i.Id).OrderBy(x => x));
    }

    [Fact]
    public void Dlc_is_found_by_the_name_of_its_game()
    {
        var found = CatalogQuery.Apply(
            Catalog,
            new(" XCOM ", [], null, null, [], null, null, false, false, false, "title-asc", 1, 24, Dlc: CatalogQuery.DlcOnly),
            NoRank);

        Assert.Equal(new[] { "xcom-dlc-1", "xcom-dlc-2" }, found.Items.Select(i => i.Id).OrderBy(x => x));
        Assert.All(found.Items, item => Assert.Equal("xcom", item.ParentTitle));
    }

    [Fact]
    public void Counts_follow_the_other_filters()
    {
        var all = Query(null).Facets.Dlc!;
        Assert.Equal(2, all.HasDlc);
        Assert.Equal(3, all.DlcOnly);

        // Жанр RPG: одна игра с дополнением и одно дополнение.
        var rpg = Query(null, category: "RPG").Facets.Dlc!;
        Assert.Equal(1, rpg.HasDlc);
        Assert.Equal(1, rpg.DlcOnly);
    }
}
