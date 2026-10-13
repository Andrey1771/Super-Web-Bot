using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.SteamImport;

/// <summary>Итог разбора карточки Steam: готовые документы магазина или причина, по которой игру не берём.</summary>
public sealed record SteamMapResult(Game? Game, GameDetails? Details, string? SkipReason)
{
    public static SteamMapResult Skip(string reason) => new(null, null, reason);
}

/// <summary>
/// Карточка Steam → Game + GameDetails магазина. Без сети и базы: всё, что нужно, приходит параметрами,
/// поэтому правила (что берём, как называем жанры, откуда цена) проверяются тестами.
///
/// Что не берём и почему:
/// - не игры (саундтреки, демо, ПО) — это другие товары; DLC берутся только импортом к своей игре
///   (import-dlc), остальные правила для них те же; программы Steam часто помечает типом
///   «game», их выдают жанры вроде Utilities или Design &amp; Illustration;
/// - бесплатные — ключ на них не продают;
/// - с откровенным контентом для взрослых (коды Steam 3 и 4) — не для этой витрины;
/// - без цены в долларах — Steam её не продаёт (снята, региональный запрет) или не продаёт пока;
/// - ещё не вышедшие без точной даты: у магазина нет поля «квартал/год», а придуманный день
///   покупатель принял бы за дату релиза.
/// </summary>
public static partial class SteamGameMapper
{
    public static readonly string[] Locales = ["ru", "uk", "pl"];

    /// <summary>Жанры Steam, которых у игр не бывает: так помечены программы (Wallpaper Engine, Aseprite…).</summary>
    public static readonly string[] SoftwareGenres =
    [
        "Utilities", "Design & Illustration", "Video Production", "Animation & Modeling", "Software Training",
        "Audio Production", "Photo Editing", "Web Publishing", "Game Development", "Accounting",
    ];

    /// <summary>
    /// Метки SteamSpy о содержимом (Nudity, Gore…) — предупреждения, а не жанр: в «теги» карточки,
    /// по которым покупатель ищет и получает рекомендации, они не идут. Возраст — в AgeRating.
    /// </summary>
    public static readonly string[] ContentWarningTags =
    [
        "Nudity", "Sexual Content", "Gore", "Violent", "Mature", "NSFW", "Hentai", "Adult Content",
    ];

    public const int MaxScreenshots = 12;
    public const int MaxTrailers = 3;

    /// <summary>Внешний идентификатор игры из Steam — по нему повторный импорт находит уже заведённую.</summary>
    public static string ExternalId(string appId) => $"steam-{appId}";

    public static SteamMapResult Map(
        SteamApp en,
        IReadOnlyDictionary<string, SteamApp> localized,
        IReadOnlyList<string> tags,
        string? coverUrl,
        DateTime utcNow,
        bool asDlc = false,
        bool asSoftware = false)
    {
        // DLC — отдельный товар, но только при импорте к своей игре (asDlc): сам по себе в каталог игр он не попадает.
        var expectedType = asDlc ? "dlc" : "game";
        if (!string.Equals(en.Type, expectedType, StringComparison.OrdinalIgnoreCase))
        {
            return SteamMapResult.Skip(asDlc ? $"not a DLC ({en.Type})" : $"not a game ({en.Type})");
        }
        // Программы Steam помечает типом game, отличить их можно только по жанрам. Обычный импорт их пропускает,
        // импорт программ (asSoftware) — наоборот, берёт только их.
        var isSoftware = en.Genres.Any(g => SoftwareGenres.Contains(g, StringComparer.OrdinalIgnoreCase));
        if (isSoftware && !asSoftware)
        {
            return SteamMapResult.Skip("software, not a game");
        }
        if (asSoftware && !isSoftware)
        {
            return SteamMapResult.Skip("not software: no software genres on Steam");
        }
        if (en.IsFree)
        {
            return SteamMapResult.Skip("free to play");
        }
        if (en.ContentDescriptorIds.Contains(3) || en.ContentDescriptorIds.Contains(4))
        {
            return SteamMapResult.Skip("adult-only content");
        }
        if (en.PriceInitialCents is not > 0 || !string.Equals(en.PriceCurrency, "USD", StringComparison.OrdinalIgnoreCase))
        {
            return SteamMapResult.Skip("no USD price on Steam");
        }
        var releaseDate = ParseReleaseDate(en.ReleaseDateText);
        if (releaseDate is null)
        {
            return SteamMapResult.Skip($"release date is not exact ({en.ReleaseDateText ?? "none"})");
        }

        var name = CleanName(en.Name);
        if (name.Length == 0)
        {
            return SteamMapResult.Skip("no name");
        }
        var price = Math.Round(en.PriceInitialCents.Value / 100m, 2);
        var type = PickType(en.Genres, tags);
        var shortText = PlainText(en.ShortDescription);
        var slug = SuperBot.WebApi.Controllers.SeoController.Slugify(name);

        var game = new Game
        {
            ExternalId = ExternalId(en.AppId),
            Slug = slug,
            Name = name,
            Title = name,
            Price = price,
            Currency = "USD",
            Description = shortText,
            DescriptionI18n = LocalizedText(localized, app => PlainText(app.ShortDescription), shortText),
            GameType = asSoftware ? default : type,
            Genre = asSoftware ? null : GameGenres.LegacyTag(type),
            Kind = asSoftware ? ProductKind.Software : ProductKind.Game,
            SoftwareCategory = asSoftware ? SoftwareCategoryFor(en.Genres) : null,
            ImagePath = coverUrl ?? "",
            ReleaseDate = releaseDate.Value,
        };

        var aboutMarkdown = WithText(SteamHtml.ToMarkdown(en.AboutTheGameHtml), shortText);
        var details = new GameDetails
        {
            Slug = slug,
            Title = name,
            Tagline = shortText,
            TaglineI18n = game.DescriptionI18n,
            DescriptionMarkdown = aboutMarkdown,
            DescriptionMarkdownI18n = LocalizedText(localized, app => WithText(SteamHtml.ToMarkdown(app.AboutTheGameHtml), PlainText(app.ShortDescription)), aboutMarkdown),
            Cover = coverUrl is null ? null : new GameCover { Url = coverUrl, Alt = name },
            Gallery = BuildGallery(en, name),
            Genres = en.Genres.ToList(),
            GenresI18n = LocalizedGenres(en, localized),
            Tags = tags.Where(t => !ContentWarningTags.Contains(t, StringComparer.OrdinalIgnoreCase)).Take(8).ToList(),
            Developer = Studio(en.Developers, en.Website),
            Publisher = Studio(en.Publishers, null),
            ReleaseDate = releaseDate,
            Platforms = new GamePlatforms { Windows = en.Windows, Mac = en.Mac, Linux = en.Linux },
            Languages = BuildLanguages(en.SupportedLanguagesHtml),
            AgeRating = BuildAgeRating(en),
            OnlineFeatures = BuildFeatures(en.Categories),
            ControllerSupport = en.ControllerSupport?.ToLowerInvariant() switch
            {
                "full" => ControllerSupport.Full,
                "partial" => ControllerSupport.Partial,
                _ => ControllerSupport.None,
            },
            CloudSavesSupported = en.Categories.Any(c => c.Equals("Steam Cloud", StringComparison.OrdinalIgnoreCase)),
            BasePrice = price,
            FinalPrice = price,
            Currency = "USD",
            IsActive = true,
            IsDraft = false,
            IsNew = releaseDate.Value <= utcNow && releaseDate.Value > utcNow.AddDays(-60),
            IsTopRated = en.MetacriticScore >= 85,
            KeyType = GameKeyType.SteamKey,
            SystemRequirements = new GameSystemRequirements
            {
                Windows = BuildRequirements(en.PcRequirementsMinimumHtml, en.PcRequirementsRecommendedHtml),
            },
        };

        return new SteamMapResult(game, details, null);
    }

    /// <summary>
    /// Категория программы из жанров Steam. Утилиты — раньше графики: у Wallpaper Engine есть и то и другое,
    /// а это всё-таки утилита. Операционных систем, антивирусов и VPN в Steam нет — эти категории заводятся вручную.
    /// </summary>
    public static string SoftwareCategoryFor(IReadOnlyList<string> genres)
    {
        bool Genre(params string[] names) => genres.Any(g => names.Any(n => g.Equals(n, StringComparison.OrdinalIgnoreCase)));

        if (Genre("Utilities")) return "utilities";
        if (Genre("Accounting")) return "office";
        if (Genre("Design & Illustration", "Animation & Modeling", "Photo Editing", "Video Production", "Audio Production", "Game Development")) return "design";
        return "utilities";
    }

    /// <summary>
    /// Жанр магазина — один из двенадцати. Хоррор и головоломки у Steam не жанры, а метки, поэтому
    /// сначала смотрим на самые популярные метки, потом — на жанры Steam в порядке «от частного к общему»:
    /// у RPG почти всегда есть и Action, и тогда важнее именно RPG.
    /// </summary>
    public static GameType PickType(IReadOnlyList<string> genres, IReadOnlyList<string> tags)
    {
        var topTags = tags.Take(5).ToList();
        bool Tag(params string[] names) => topTags.Any(t => names.Any(n => t.Equals(n, StringComparison.OrdinalIgnoreCase)));
        bool Genre(params string[] names) => genres.Any(g => names.Any(n => g.Equals(n, StringComparison.OrdinalIgnoreCase)));

        if (Tag("Horror", "Survival Horror", "Psychological Horror")) return GameType.Horror;
        if (Genre("Massively Multiplayer")) return GameType.MassivelyMultiplayerOnline;
        if (Tag("Puzzle", "Puzzle Platformer")) return GameType.Puzzle;
        if (Tag("Card Game", "Board Game", "Deckbuilding", "Card Battler", "Chess")) return GameType.CardAndBoardGames;
        if (Genre("RPG")) return GameType.RolePlayingGames;
        if (Genre("Strategy")) return GameType.Strategy;
        if (Genre("Sports", "Racing")) return GameType.Sports;
        if (Genre("Simulation")) return GameType.Simulation;
        if (Genre("Education")) return GameType.EducationalGames;
        if (Genre("Action")) return GameType.Action;
        if (Genre("Adventure")) return GameType.Adventure;
        if (Genre("Casual")) return GameType.CasualGames;
        return GameType.Action;
    }

    /// <summary>
    /// Дата выхода в английском написании Steam: «Dec 9, 2020» или «9 Dec, 2020». «Q1 2027»,
    /// «2027», «Coming soon» — не точные, null.
    /// </summary>
    public static DateTime? ParseReleaseDate(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }
        string[] formats = ["MMM d, yyyy", "d MMM, yyyy", "MMMM d, yyyy", "d MMMM, yyyy", "MMM d yyyy", "d MMM yyyy", "MMM. d, yyyy", "yyyy-MM-dd"];
        return DateTime.TryParseExact(text.Trim(), formats, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date)
            ? DateTime.SpecifyKind(date.Date, DateTimeKind.Utc)
            : null;
    }

    /// <summary>«EA SPORTS FC™ 27» → «EA SPORTS FC 27»: знаки товарных знаков в названии карточки — шум.</summary>
    public static string CleanName(string name) =>
        MultiSpace().Replace(WebUtility.HtmlDecode(name).Replace("™", "").Replace("®", "").Replace("©", ""), " ").Trim();

    /// <summary>Описание без единого слова (одни картинки) — впереди краткое описание игры.</summary>
    private static string WithText(string markdown, string shortText)
    {
        var text = MarkdownImage().Replace(markdown, "").Trim();
        if (text.Length > 0 || shortText.Length == 0)
        {
            return markdown;
        }
        return markdown.Length == 0 ? shortText : $"{shortText}\n\n{markdown}";
    }

    private static string PlainText(string? html) =>
        MultiSpace().Replace(WebUtility.HtmlDecode(Tags().Replace(html ?? "", " ")), " ").Trim();

    /// <summary>
    /// Перевод есть, только если издатель его дал: на остальных языках Steam возвращает английский
    /// текст — такой не сохраняем, иначе витрина считала бы карточку переведённой.
    /// </summary>
    private static Dictionary<string, string>? LocalizedText(IReadOnlyDictionary<string, SteamApp> localized, Func<SteamApp, string> pick, string english)
    {
        var result = new Dictionary<string, string>();
        foreach (var (locale, app) in localized)
        {
            var text = pick(app);
            if (text.Length > 0 && !string.Equals(text, english, StringComparison.Ordinal))
            {
                result[locale] = text;
            }
        }
        return result.Count > 0 ? result : null;
    }

    private static Dictionary<string, List<string>>? LocalizedGenres(SteamApp en, IReadOnlyDictionary<string, SteamApp> localized)
    {
        var result = new Dictionary<string, List<string>>();
        foreach (var (locale, app) in localized)
        {
            // Названия жанров переведены самим Steam; порядок тот же, что у английских, — сверяем по id.
            if (app.GenreIds.SequenceEqual(en.GenreIds) && app.Genres.Count == en.Genres.Count && !app.Genres.SequenceEqual(en.Genres))
            {
                result[locale] = app.Genres.ToList();
            }
        }
        return result.Count > 0 ? result : null;
    }

    private static GameStudioInfo? Studio(IReadOnlyList<string> names, string? website) =>
        names.Count == 0 ? null : new GameStudioInfo
        {
            Name = string.Join(", ", names.Take(2)),
            Website = Uri.TryCreate(website, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps ? website : null,
        };

    private static List<GameMediaItem> BuildGallery(SteamApp en, string name)
    {
        var items = new List<GameMediaItem>();
        var order = 0;
        foreach (var movie in en.Movies.OrderByDescending(m => m.Highlight).Take(MaxTrailers))
        {
            items.Add(new GameMediaItem
            {
                Id = $"steam-movie-{movie.Id}",
                Type = "video",
                // Только HLS: его играет и Safari, и hls.js; DASH потребовал бы ещё один плеер.
                Url = movie.HlsUrl,
                ThumbUrl = movie.ThumbnailUrl,
                PosterUrl = movie.ThumbnailUrl,
                Title = string.IsNullOrWhiteSpace(movie.Name) ? name : CleanName(movie.Name),
                IsTrailer = true,
                Order = order++,
            });
        }
        var index = 0;
        foreach (var shot in en.Screenshots.Take(MaxScreenshots))
        {
            items.Add(new GameMediaItem
            {
                Id = $"steam-screenshot-{index++}",
                Type = "image",
                Url = shot.FullUrl,
                ThumbUrl = string.IsNullOrEmpty(shot.ThumbnailUrl) ? shot.FullUrl : shot.ThumbnailUrl,
                Title = name,
                Width = 1920,
                Height = 1080,
                Order = order++,
            });
        }
        return items.Where(i => !string.IsNullOrEmpty(i.Url)).ToList();
    }

    private static GameLanguageSupport BuildLanguages(string html)
    {
        var languages = SteamHtml.ParseLanguages(html);
        return new GameLanguageSupport
        {
            Audio = languages.Where(l => l.FullAudio).Select(l => l.Name).ToList(),
            Text = languages.Select(l => l.Name).ToList(),
        };
    }

    private static GameAgeRating? BuildAgeRating(SteamApp en)
    {
        if (!string.IsNullOrWhiteSpace(en.PegiRating))
        {
            return new GameAgeRating { System = "PEGI", Label = en.PegiRating.Trim() };
        }
        if (!string.IsNullOrWhiteSpace(en.EsrbRating))
        {
            return new GameAgeRating { System = "ESRB", Label = en.EsrbRating.Trim().ToUpperInvariant() };
        }
        return en.RequiredAge > 0 ? new GameAgeRating { System = null, Label = $"{en.RequiredAge}+" } : null;
    }

    /// <summary>Категории Steam → короткие пометки витрины в том же стиле, что заводит админка.</summary>
    private static readonly (string Steam, string Ours)[] FeatureMap =
    [
        ("Single-player", "Single-player"),
        ("Online Co-op", "Online co-op"),
        ("Shared/Split Screen Co-op", "Local co-op"),
        ("LAN Co-op", "LAN co-op"),
        ("Online PvP", "Online PvP"),
        ("Shared/Split Screen PvP", "Local PvP"),
        ("LAN PvP", "LAN PvP"),
        ("MMO", "MMO"),
        ("Cross-Platform Multiplayer", "Cross-platform multiplayer"),
        ("Steam Cloud", "Cloud saves"),
        ("VR Support", "VR support"),
        ("VR Only", "VR only"),
        ("In-App Purchases", "In-game purchases"),
    ];

    private static List<string> BuildFeatures(IReadOnlyList<string> categories)
    {
        var result = FeatureMap
            .Where(f => categories.Any(c => c.Equals(f.Steam, StringComparison.OrdinalIgnoreCase)))
            .Select(f => f.Ours)
            .ToList();
        // «Multi-player» без уточнения — когда ни онлайн, ни локальный режим Steam не указал.
        if (categories.Any(c => c.Equals("Multi-player", StringComparison.OrdinalIgnoreCase))
            && !result.Any(r => r.Contains("co-op", StringComparison.OrdinalIgnoreCase) || r.Contains("PvP", StringComparison.Ordinal) || r == "MMO"))
        {
            result.Insert(Math.Min(1, result.Count), "Multiplayer");
        }
        return result;
    }

    private static GameSystemRequirementBlock? BuildRequirements(string? minimumHtml, string? recommendedHtml)
    {
        var minimum = BuildSpec(minimumHtml);
        var recommended = BuildSpec(recommendedHtml);
        if (minimum is null && recommended is null)
        {
            return null;
        }
        return new GameSystemRequirementBlock { Minimum = minimum ?? new GameSystemRequirementSpec(), Recommended = recommended };
    }

    internal static GameSystemRequirementSpec? BuildSpec(string? html)
    {
        var lines = SteamHtml.ParseRequirements(html);
        if (lines.Count == 0)
        {
            return null;
        }
        var spec = new GameSystemRequirementSpec();
        var notes = new List<string>();
        foreach (var (label, value) in lines)
        {
            if (value.Length == 0)
            {
                continue;
            }
            switch (label.ToLowerInvariant())
            {
                case "os":
                case "os *":
                case "operating system":
                    spec.Os ??= value;
                    break;
                case "processor":
                case "cpu":
                    spec.Cpu ??= value;
                    break;
                case "memory":
                case "ram":
                    spec.Ram ??= value;
                    break;
                case "graphics":
                case "video card":
                case "video":
                    spec.Gpu ??= value;
                    break;
                case "storage":
                case "hard drive":
                case "hard disk space":
                case "hard disk":
                case "disk space":
                    spec.Storage ??= value;
                    break;
                case "":
                    notes.Add(value);
                    break;
                default:
                    notes.Add($"{label}: {value}");
                    break;
            }
        }
        spec.Notes = notes.Count > 0 ? string.Join("\n", notes) : null;
        return spec;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex MultiSpace();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"!\[[^\]]*\]\([^)]*\)")]
    private static partial Regex MarkdownImage();
}
