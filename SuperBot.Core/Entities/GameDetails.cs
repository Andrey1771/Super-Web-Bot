using System;
using System.Collections.Generic;

namespace SuperBot.Core.Entities
{
    public enum GameKeyType
    {
        SteamKey,
        Epic,
        EaApp,
        Uplay,
        Other
    }

    public enum ControllerSupport
    {
        None,
        Partial,
        Full
    }

    public class GameDetails
    {
        public string? Id { get; set; }
        public string? GameId { get; set; }
        public string? Slug { get; set; }
        public string? Title { get; set; }
        public string? Tagline { get; set; }
        public string? DescriptionMarkdown { get; set; }
        public GameCover? Cover { get; set; }
        public List<GameMediaItem> Gallery { get; set; } = new();
        public List<string> Genres { get; set; } = new();
        public List<string> Tags { get; set; } = new();
        public GameStudioInfo? Developer { get; set; }
        public GameStudioInfo? Publisher { get; set; }
        public DateTime? ReleaseDate { get; set; }
        public GamePlatforms Platforms { get; set; } = new();
        public GameLanguageSupport Languages { get; set; } = new();
        public GameAgeRating? AgeRating { get; set; }
        public List<string> OnlineFeatures { get; set; } = new();
        public ControllerSupport ControllerSupport { get; set; } = ControllerSupport.Full;
        public bool CloudSavesSupported { get; set; }

        public decimal BasePrice { get; set; }
        public decimal? DiscountPercent { get; set; }
        public string? Currency { get; set; }
        public decimal FinalPrice { get; set; }
        public bool IsActive { get; set; }
        public bool IsNew { get; set; }
        public bool IsTopRated { get; set; }
        public bool ShowInFeaturedStorefront { get; set; }
        public int FeaturedStorefrontPriority { get; set; }
        public GameKeyType KeyType { get; set; } = GameKeyType.SteamKey;

        public List<string> KeyFeatures { get; set; } = new();
        public List<GameAwardBadge> Awards { get; set; } = new();
        public List<GameEdition> Editions { get; set; } = new();
        public List<GameDlcItem> DlcItems { get; set; } = new();
        public GameSystemRequirements SystemRequirements { get; set; } = new();

        public List<string> SimilarGameIds { get; set; } = new();
        public GameAutoRecommendRules AutoRecommendRules { get; set; } = new();

        public double RatingAvg { get; set; }
        public int ReviewsCount { get; set; }
    }

    public class GameCover
    {
        public string? Url { get; set; }
        public string? Alt { get; set; }
    }

    public class GameMediaItem
    {
        public string? Id { get; set; }
        public string? Type { get; set; }
        public string? Url { get; set; }
        public string? ThumbUrl { get; set; }
        public string? PosterUrl { get; set; }
        public int? DurationSec { get; set; }
        public string? Title { get; set; }
        public string? Caption { get; set; }
        public bool IsTrailer { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
        public int Order { get; set; }
    }

    public class GameStudioInfo
    {
        public string? Name { get; set; }
        public string? Website { get; set; }
        public string? LogoUrl { get; set; }
    }

    public class GamePlatforms
    {
        public bool Windows { get; set; }
        public bool Mac { get; set; }
        public bool Linux { get; set; }
        // Консоли: ключ может быть для PSN/Xbox-стора, а не только PC-лаунчеров.
        // Добавлены позже — у старых документов Mongo вернёт false, что и требуется.
        public bool PlayStation { get; set; }
        public bool Xbox { get; set; }
    }

    public class GameLanguageSupport
    {
        public List<string> Audio { get; set; } = new();
        public List<string> Text { get; set; } = new();
    }

    public class GameAgeRating
    {
        public string? System { get; set; }
        public string? Label { get; set; }
        public string? IconUrl { get; set; }
    }

    public class GameEdition
    {
        public string? Code { get; set; }
        public string? Title { get; set; }
        public string? Description { get; set; }
        public decimal Price { get; set; }
        public decimal? DiscountPercent { get; set; }
        public List<string> IncludedItems { get; set; } = new();
        public bool IsDefault { get; set; }
    }

    public class GameDlcItem
    {
        public string? Id { get; set; }
        public string? Title { get; set; }
        public string? CoverUrl { get; set; }
        public decimal Price { get; set; }
        public decimal? DiscountPercent { get; set; }
        public bool IsBundle { get; set; }
    }

    public class GameAwardBadge
    {
        public string? Title { get; set; }
        public int? Year { get; set; }
        public string? Type { get; set; }
        public string? IconUrl { get; set; }
    }

    public class GameSystemRequirements
    {
        public GameSystemRequirementBlock Windows { get; set; } = new();
        public GameSystemRequirementBlock? Mac { get; set; }
        public GameSystemRequirementBlock? Linux { get; set; }
    }

    public class GameSystemRequirementBlock
    {
        public GameSystemRequirementSpec Minimum { get; set; } = new();
        public GameSystemRequirementSpec? Recommended { get; set; }
    }

    public class GameSystemRequirementSpec
    {
        public string? Os { get; set; }
        public string? Cpu { get; set; }
        public string? Ram { get; set; }
        public string? Gpu { get; set; }
        public string? Storage { get; set; }
        public string? Notes { get; set; }
    }

    public class GameAutoRecommendRules
    {
        public bool Enabled { get; set; }
        public bool ByGenres { get; set; }
        public bool ByTags { get; set; }
        public bool ByPublisher { get; set; }
    }
}
