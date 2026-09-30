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
        /// <summary>Переводы: подзаголовок на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? TaglineI18n { get; set; }
        public string? DescriptionMarkdown { get; set; }
        /// <summary>Переводы: описание (markdown) на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? DescriptionMarkdownI18n { get; set; }
        public GameCover? Cover { get; set; }
        public List<GameMediaItem> Gallery { get; set; } = new();
        public List<string> Genres { get; set; } = new();
        /// <summary>
        /// Переводы жанров по языкам сайта: списки той же длины и в том же порядке, что Genres (пустая строка —
        /// без перевода). Английское значение остаётся адресом и фильтром, перевод — только подпись.
        /// </summary>
        public Dictionary<string, List<string>>? GenresI18n { get; set; }
        public List<string> Tags { get; set; } = new();
        /// <summary>Переводы тегов — как у жанров: по позициям, английское значение остаётся фильтром.</summary>
        public Dictionary<string, List<string>>? TagsI18n { get; set; }
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

        /// <summary>
        /// Черновик: карточка заполняется и на витрине не показывается. Значение по умолчанию —
        /// false, то есть «опубликована»: у записей, заведённых до появления этого поля, его в
        /// документе нет, и они читаются как опубликованные. Миграция поэтому не нужна, а
        /// каталог не пропадает у покупателей в момент выкладки.
        /// </summary>
        public bool IsDraft { get; set; }

        public bool IsNew { get; set; }
        public bool IsTopRated { get; set; }
        public bool ShowInFeaturedStorefront { get; set; }
        public int FeaturedStorefrontPriority { get; set; }
        public GameKeyType KeyType { get; set; } = GameKeyType.SteamKey;

        /// <summary>Где активируется ключ ПО. У игр null — площадку задаёт KeyType.</summary>
        public SoftwareActivation? Activation { get; set; }

        public List<string> KeyFeatures { get; set; } = new();
        /// <summary>Переводы списка особенностей по языкам сайта; нет языка — английский список.</summary>
        public Dictionary<string, List<string>>? KeyFeaturesI18n { get; set; }
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
        /// <summary>Переводы: подпись к медиа на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? CaptionI18n { get; set; }
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
        // Мобильные ОС — для ПО (антивирус, VPN). Нет поля — false.
        public bool Android { get; set; }
        public bool Ios { get; set; }
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
        /// <summary>Переводы: подпись рейтинга на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? LabelI18n { get; set; }
        public string? IconUrl { get; set; }
    }

    public class GameEdition
    {
        public string? Code { get; set; }
        public string? Title { get; set; }
        /// <summary>Переводы: название издания на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? TitleI18n { get; set; }
        public string? Description { get; set; }
        /// <summary>Переводы: описание издания на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? DescriptionI18n { get; set; }
        public decimal Price { get; set; }
        /// <summary>
        /// Ручные цены издания по валютам (код → цена). Как у игры: ручная цена важнее курса;
        /// нет ни её, ни курса — в этой валюте издание не продаётся. Price — в базовой валюте игры.
        /// </summary>
        public Dictionary<string, decimal>? Prices { get; set; }
        public decimal? DiscountPercent { get; set; }
        public List<string> IncludedItems { get; set; } = new();
        public bool IsDefault { get; set; }

        // --- Лицензия ПО: у игровых изданий пусто. Издание ПО = вариант лицензии (срок × устройства) со своей ценой и складом. ---

        /// <summary>Срок лицензии в месяцах; null — бессрочная (или не указан).</summary>
        public int? LicenseTermMonths { get; set; }
        /// <summary>На сколько устройств; null — не указано.</summary>
        public int? LicenseDevices { get; set; }
        /// <summary>Подписка: продлевается у производителя, и налоговый код у неё свой.</summary>
        public bool IsSubscription { get; set; }

        /// <summary>
        /// Подпись лицензии для витрины («1 year · 3 devices», «Subscription · 1 month»), null у игровых изданий.
        /// Считается здесь, а не на фронте: страница товара, карточка каталога, кабинет и письмо обязаны называть
        /// одну и ту же лицензию одинаково. Только для чтения — в базу и из запросов не идёт.
        /// </summary>
        [System.Text.Json.Serialization.JsonInclude]
        public string? Label => SoftwareCatalog.LicenseLabel(this);
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
        /// <summary>Переводы: название награды на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? TitleI18n { get; set; }
        public int? Year { get; set; }
        public string? Type { get; set; }
        public string? IconUrl { get; set; }
    }

    public class GameSystemRequirements
    {
        /// <summary>
        /// Все три системы равноправны и необязательны. Windows раньше была обязательной
        /// (создавалась пустым блоком), хотя игра может продаваться только для macOS, Linux
        /// или вовсе консольной — тогда пустой блок означал бы «поддерживается, но не указано».
        /// Отсутствие блока и есть «не поддерживается»; витрина показывает вкладку только для
        /// заполненных систем, а проверка полноты принимает любую из трёх.
        /// </summary>
        public GameSystemRequirementBlock? Windows { get; set; }
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
        /// <summary>Переводы: примечания к требованиям на языках сайта (ru/uk/pl); основное поле — английское.</summary>
        public Dictionary<string, string>? NotesI18n { get; set; }
    }

    public class GameAutoRecommendRules
    {
        public bool Enabled { get; set; }
        public bool ByGenres { get; set; }
        public bool ByTags { get; set; }
        public bool ByPublisher { get; set; }
    }
}
