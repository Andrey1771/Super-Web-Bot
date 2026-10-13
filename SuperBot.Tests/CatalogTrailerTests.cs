using SuperBot.Core.Catalog;
using SuperBot.Core.Entities;
using Xunit;

namespace SuperBot.Tests;

/// <summary>Один ролик на игру для превью при наведении: помеченный трейлер важнее первого видео, картинки не считаются.</summary>
public class CatalogTrailerTests
{
    [Fact]
    public void Prefers_the_marked_trailer_over_the_first_video_and_falls_back_to_its_thumbnail()
    {
        var details = new GameDetails
        {
            Gallery = new List<GameMediaItem>
            {
                new() { Type = "image", Url = "shot.jpg", Order = 0 },
                new() { Type = "video", Url = "gameplay.mp4", ThumbUrl = "gameplay.jpg", Order = 1 },
                new() { Type = "video", Url = "trailer.mp4", ThumbUrl = "trailer-thumb.jpg", IsTrailer = true, Order = 2 }
            }
        };

        Assert.Equal(("trailer.mp4", "trailer-thumb.jpg"), CatalogTrailer.Pick(details));
    }

    [Fact]
    public void Takes_the_first_video_by_order_when_nothing_is_marked_and_nothing_when_there_are_only_stills()
    {
        var unmarked = new GameDetails
        {
            Gallery = new List<GameMediaItem>
            {
                new() { Type = "video", Url = "second.mp4", PosterUrl = "second.jpg", Order = 5 },
                new() { Type = "video", Url = "first.mp4", PosterUrl = "first.jpg", Order = 1 }
            }
        };
        Assert.Equal(("first.mp4", "first.jpg"), CatalogTrailer.Pick(unmarked));

        var stills = new GameDetails { Gallery = new List<GameMediaItem> { new() { Type = "image", Url = "shot.jpg" } } };
        Assert.Equal((null, null), CatalogTrailer.Pick(stills));
        Assert.Equal((null, null), CatalogTrailer.Pick(null));
    }
}
