using System;
using System.Collections.Generic;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameDetailsDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("slug")]
        public string Slug { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("tagline")]
        public string Tagline { get; set; }

        [BsonElement("taglineI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? TaglineI18n { get; set; }

        [BsonElement("descriptionMarkdown")]
        public string DescriptionMarkdown { get; set; }

        [BsonElement("descriptionMarkdownI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? DescriptionMarkdownI18n { get; set; }

        [BsonElement("cover")]
        public GameCoverDb Cover { get; set; }

        [BsonElement("gallery")]
        public List<GameMediaItemDb> Gallery { get; set; } = new();

        [BsonElement("genres")]
        public List<string> Genres { get; set; } = new();

        [BsonElement("genresI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, List<string>>? GenresI18n { get; set; }

        [BsonElement("tags")]
        public List<string> Tags { get; set; } = new();

        [BsonElement("tagsI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, List<string>>? TagsI18n { get; set; }

        [BsonElement("developer")]
        public GameStudioInfoDb Developer { get; set; }

        [BsonElement("publisher")]
        public GameStudioInfoDb Publisher { get; set; }

        [BsonElement("releaseDate")]
        public DateTime? ReleaseDate { get; set; }

        [BsonElement("platforms")]
        public GamePlatformsDb Platforms { get; set; } = new();

        [BsonElement("languages")]
        public GameLanguageSupportDb Languages { get; set; } = new();

        [BsonElement("ageRating")]
        public GameAgeRatingDb AgeRating { get; set; }

        [BsonElement("onlineFeatures")]
        public List<string> OnlineFeatures { get; set; } = new();

        [BsonElement("controllerSupport")]
        public string ControllerSupport { get; set; }

        [BsonElement("cloudSavesSupported")]
        public bool CloudSavesSupported { get; set; }

        [BsonElement("basePrice")]
        public decimal BasePrice { get; set; }

        [BsonElement("discountPercent")]
        public decimal? DiscountPercent { get; set; }

        [BsonElement("currency")]
        public string Currency { get; set; }

        [BsonElement("finalPrice")]
        public decimal FinalPrice { get; set; }

        [BsonElement("isActive")]
        public bool IsActive { get; set; }

        // Отсутствующий в документе элемент читается как false — «опубликована». Добавление
        // поля безопасно: ломается десериализация только на ЛИШНИХ элементах, а не на недостающих.
        [BsonElement("isDraft")]
        public bool IsDraft { get; set; }

        [BsonElement("isNew")]
        public bool IsNew { get; set; }

        [BsonElement("isTopRated")]
        public bool IsTopRated { get; set; }

        [BsonElement("showInFeaturedStorefront")]
        public bool ShowInFeaturedStorefront { get; set; }

        [BsonElement("featuredStorefrontPriority")]
        public int FeaturedStorefrontPriority { get; set; }

        [BsonElement("keyType")]
        public string KeyType { get; set; }

        [BsonElement("activation")]
        [BsonIgnoreIfNull]
        public SoftwareActivationDb? Activation { get; set; }

        [BsonElement("keyFeatures")]
        public List<string> KeyFeatures { get; set; } = new();

        [BsonElement("keyFeaturesI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, List<string>>? KeyFeaturesI18n { get; set; }

        [BsonElement("awards")]
        public List<GameAwardBadgeDb> Awards { get; set; } = new();

        [BsonElement("editions")]
        public List<GameEditionDb> Editions { get; set; } = new();

        [BsonElement("dlcItems")]
        public List<GameDlcItemDb> DlcItems { get; set; } = new();

        [BsonElement("systemRequirements")]
        public GameSystemRequirementsDb SystemRequirements { get; set; } = new();

        [BsonElement("similarGameIds")]
        public List<string> SimilarGameIds { get; set; } = new();

        [BsonElement("autoRecommendRules")]
        public GameAutoRecommendRulesDb AutoRecommendRules { get; set; } = new();

        [BsonElement("ratingAvg")]
        public double RatingAvg { get; set; }

        [BsonElement("reviewsCount")]
        public int ReviewsCount { get; set; }
    }

    public class GameCoverDb
    {
        [BsonElement("url")]
        public string Url { get; set; }

        [BsonElement("alt")]
        public string Alt { get; set; }
    }

    // [BsonNoId] обязателен: у драйвера есть конвенция NamedIdMember — член с именем Id
    // автоматически становится идентификатором документа и читается ТОЛЬКО из _id,
    // молча игнорируя [BsonElement("id")] ниже. Для вложенного документа это неверно:
    // элемент "id" тогда не матчится ни на что и падает десериализация всего батча,
    // из-за чего 500 отдают и остальные записи коллекции.
    [BsonNoId]
    public class GameMediaItemDb
    {
        [BsonElement("id")]
        public string Id { get; set; }

        [BsonElement("type")]
        public string Type { get; set; }

        [BsonElement("url")]
        public string Url { get; set; }

        [BsonElement("thumbUrl")]
        public string ThumbUrl { get; set; }

        [BsonElement("posterUrl")]
        public string PosterUrl { get; set; }

        [BsonElement("durationSec")]
        public int? DurationSec { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("caption")]
        public string Caption { get; set; }

        [BsonElement("captionI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? CaptionI18n { get; set; }

        [BsonElement("isTrailer")]
        public bool IsTrailer { get; set; }

        [BsonElement("width")]
        public int? Width { get; set; }

        [BsonElement("height")]
        public int? Height { get; set; }

        [BsonElement("order")]
        public int Order { get; set; }
    }

    public class GameStudioInfoDb
    {
        [BsonElement("name")]
        public string Name { get; set; }

        [BsonElement("website")]
        public string Website { get; set; }

        [BsonElement("logoUrl")]
        public string LogoUrl { get; set; }
    }

    public class GamePlatformsDb
    {
        [BsonElement("windows")]
        public bool Windows { get; set; }

        [BsonElement("mac")]
        public bool Mac { get; set; }

        [BsonElement("linux")]
        public bool Linux { get; set; }

        // Консоли раньше в документ не попадали вовсе: в сущности флаги были, а здесь нет, и при сохранении они терялись.
        [BsonElement("playStation")]
        public bool PlayStation { get; set; }

        [BsonElement("xbox")]
        public bool Xbox { get; set; }

        [BsonElement("android")]
        public bool Android { get; set; }

        [BsonElement("ios")]
        public bool Ios { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class SoftwareActivationDb
    {
        [BsonElement("target")]
        [BsonRepresentation(BsonType.String)]
        public SuperBot.Core.Entities.SoftwareActivationTarget Target { get; set; }

        [BsonElement("url")]
        [BsonIgnoreIfNull]
        public string? Url { get; set; }

        [BsonElement("label")]
        [BsonIgnoreIfNull]
        public string? Label { get; set; }

        [BsonElement("labelI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? LabelI18n { get; set; }
    }

    public class GameLanguageSupportDb
    {
        [BsonElement("audio")]
        public List<string> Audio { get; set; } = new();

        [BsonElement("text")]
        public List<string> Text { get; set; } = new();
    }

    public class GameAgeRatingDb
    {
        [BsonElement("system")]
        public string System { get; set; }

        [BsonElement("label")]
        public string Label { get; set; }

        [BsonElement("labelI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? LabelI18n { get; set; }

        [BsonElement("iconUrl")]
        public string IconUrl { get; set; }
    }

    public class GameEditionDb
    {
        [BsonElement("code")]
        public string Code { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("titleI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? TitleI18n { get; set; }

        [BsonElement("description")]
        public string Description { get; set; }

        [BsonElement("descriptionI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? DescriptionI18n { get; set; }

        [BsonElement("price")]
        public decimal Price { get; set; }

        [BsonElement("prices")]
        [BsonIgnoreIfNull]
        public Dictionary<string, decimal>? Prices { get; set; }

        [BsonElement("discountPercent")]
        public decimal? DiscountPercent { get; set; }

        [BsonElement("includedItems")]
        public List<string> IncludedItems { get; set; } = new();

        [BsonElement("isDefault")]
        public bool IsDefault { get; set; }

        [BsonElement("licenseTermMonths")]
        [BsonIgnoreIfNull]
        public int? LicenseTermMonths { get; set; }

        [BsonElement("licenseDevices")]
        [BsonIgnoreIfNull]
        public int? LicenseDevices { get; set; }

        [BsonElement("isSubscription")]
        [BsonIgnoreIfDefault]
        public bool IsSubscription { get; set; }
    }

    // [BsonNoId] обязателен: у драйвера есть конвенция NamedIdMember — член с именем Id
    // автоматически становится идентификатором документа и читается ТОЛЬКО из _id,
    // молча игнорируя [BsonElement("id")] ниже. Для вложенного документа это неверно:
    // элемент "id" тогда не матчится ни на что и падает десериализация всего батча,
    // из-за чего 500 отдают и остальные записи коллекции.
    [BsonNoId]
    public class GameDlcItemDb
    {
        [BsonElement("id")]
        public string Id { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("coverUrl")]
        public string CoverUrl { get; set; }

        [BsonElement("price")]
        public decimal Price { get; set; }

        [BsonElement("discountPercent")]
        public decimal? DiscountPercent { get; set; }

        [BsonElement("isBundle")]
        public bool IsBundle { get; set; }
    }

    public class GameAwardBadgeDb
    {
        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("titleI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? TitleI18n { get; set; }

        [BsonElement("year")]
        public int? Year { get; set; }

        [BsonElement("type")]
        public string Type { get; set; }

        [BsonElement("iconUrl")]
        public string IconUrl { get; set; }
    }

    public class GameSystemRequirementsDb
    {
        // Необязательна, как Mac и Linux: игра может не поддерживать Windows.
        [BsonElement("windows")]
        public GameSystemRequirementBlockDb Windows { get; set; }

        [BsonElement("mac")]
        public GameSystemRequirementBlockDb Mac { get; set; }

        [BsonElement("linux")]
        public GameSystemRequirementBlockDb Linux { get; set; }
    }

    public class GameSystemRequirementBlockDb
    {
        [BsonElement("minimum")]
        public GameSystemRequirementSpecDb Minimum { get; set; } = new();

        [BsonElement("recommended")]
        public GameSystemRequirementSpecDb Recommended { get; set; }
    }

    public class GameSystemRequirementSpecDb
    {
        [BsonElement("os")]
        public string Os { get; set; }

        [BsonElement("cpu")]
        public string Cpu { get; set; }

        [BsonElement("ram")]
        public string Ram { get; set; }

        [BsonElement("gpu")]
        public string Gpu { get; set; }

        [BsonElement("storage")]
        public string Storage { get; set; }

        [BsonElement("notes")]
        public string Notes { get; set; }

        [BsonElement("notesI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? NotesI18n { get; set; }
    }

    public class GameAutoRecommendRulesDb
    {
        [BsonElement("enabled")]
        public bool Enabled { get; set; }

        [BsonElement("byGenres")]
        public bool ByGenres { get; set; }

        [BsonElement("byTags")]
        public bool ByTags { get; set; }

        [BsonElement("byPublisher")]
        public bool ByPublisher { get; set; }
    }
}
