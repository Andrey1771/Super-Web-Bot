using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests;

/// <summary>Коды жанров: из старого номера выводится ровно тот адрес, что был у страниц жанров, и обратно.</summary>
public class GameGenresTests
{
    [Theory]
    [InlineData(GameType.Action, "action")]
    [InlineData(GameType.RolePlayingGames, "role-playing-games-rpgs")]
    [InlineData(GameType.CardAndBoardGames, "card-and-board-games")]
    [InlineData(GameType.MassivelyMultiplayerOnline, "massively-multiplayer-online-mmo")]
    public void Legacy_number_maps_to_the_old_page_address_and_back(GameType type, string tag)
    {
        Assert.Equal(tag, GameGenres.LegacyTag(type));
        Assert.Equal(type, GameGenres.LegacyType(tag));
    }

    [Fact]
    public void A_genre_added_in_admin_has_no_legacy_number()
    {
        Assert.Null(GameGenres.LegacyType("roguelike"));
    }

    [Fact]
    public void Game_without_a_genre_code_reads_it_from_the_number()
    {
        Assert.Equal("horror", GameGenres.TagOf(new Game { GameType = GameType.Horror }));
        Assert.Equal("roguelike", GameGenres.TagOf(new Game { GameType = GameType.Horror, Genre = "Roguelike" }));
    }

    [Fact]
    public void Title_comes_from_the_list_or_is_readable_from_the_code()
    {
        var genres = new[] { new GameCategory { Tag = "roguelike", Title = "Roguelites" } };
        Assert.Equal("Roguelites", GameGenres.TitleOf(genres, "roguelike"));
        Assert.Equal("Deck builders", GameGenres.TitleOf(genres, "deck-builders"));
        Assert.Equal(12, GameGenres.Defaults.Count);
    }
}
