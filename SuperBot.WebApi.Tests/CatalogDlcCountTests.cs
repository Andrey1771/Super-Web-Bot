using SuperBot.Core.Entities;
using SuperBot.WebApi.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>Пометка «+N DLC» на плитке: число опубликованных DLC игры, посчитанное при сборке снимка каталога.</summary>
public class CatalogDlcCountTests
{
    private static CatalogItem Item(string id, string? parent = null, bool draft = false) => new(
        id, id, id, id, "", GameType.Action, "Action", "", null, DateTime.UtcNow, false, 10m, 10m, "USD",
        new Dictionary<string, decimal>(), null, false, null, [], ["PC"], null, 0, true, null, 0, 0, null, false, 0,
        ParentGameId: parent, IsDraft: draft);

    [Fact]
    public void Counts_published_dlc_of_each_game()
    {
        var items = CatalogSnapshotService.WithDlcCounts(
        [
            Item("game"), Item("other"),
            Item("dlc-1", parent: "game"), Item("dlc-2", parent: "GAME"), Item("draft-dlc", parent: "game", draft: true),
        ]);

        Assert.Equal(2, items.Single(i => i.Id == "game").DlcCount);
        Assert.Equal(0, items.Single(i => i.Id == "other").DlcCount);
        Assert.Equal(0, items.Single(i => i.Id == "dlc-1").DlcCount);
    }
}
