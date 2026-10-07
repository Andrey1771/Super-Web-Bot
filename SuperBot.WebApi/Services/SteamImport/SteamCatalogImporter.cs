using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.SteamImport;

public sealed record SteamImportOptions
{
    /// <summary>Уже заведённую игру обновить данными Steam (описания, медиа, требования). Иначе — пропустить.</summary>
    public bool UpdateExisting { get; init; }

    /// <summary>
    /// При обновлении взять и цену Steam. По умолчанию цену заведённой игры не трогаем: её ставит
    /// магазин (закупка, скидки), а Steam знает только свою розницу.
    /// </summary>
    public bool RefreshPrices { get; init; }

    /// <summary>При обновлении собрать обложку заново, даже если она уже из Steam.</summary>
    public bool RefreshCovers { get; init; }

    /// <summary>
    /// Импорт DLC: id базовой игры магазина. DLC заводится товаром с этим ParentGameId; ищется только по
    /// внешнему id — по адресу DLC легко совпасть с чужой игрой («… Soundtrack», переиздание).
    /// </summary>
    public string? ParentGameId { get; init; }

    /// <summary>
    /// Appid базовой игры в Steam и всех её DLC. DLC берём, если оно к одной из них: DLC к DLC (Tactical Legacy
    /// Pack к War of the Chosen) Steam перечисляет у игры, и на странице игры ему место. Чужое — не берём.
    /// </summary>
    public IReadOnlySet<string>? ParentFamilyAppIds { get; init; }

    /// <summary>Качать трейлер. У DLC по умолчанию нет: ролик весит десятки мегабайт.</summary>
    public bool IncludeTrailers { get; init; } = true;

    /// <summary>Заводить программы (Wallpaper Engine, Aseprite…) товарами вида «ПО»; игры при этом пропускаются.</summary>
    public bool AsSoftware { get; init; }
}

public enum SteamImportOutcome { Created, Updated, Skipped, Failed }

public sealed record SteamImportItemResult(string AppId, SteamImportOutcome Outcome, string? Name, string? GameId, string? Reason);

public interface ISteamCatalogImporter
{
    Task<SteamImportItemResult> ImportAsync(string appId, SteamImportOptions options, CancellationToken ct);
}

/// <summary>
/// Одна игра Steam → товар магазина. Совпадение с заведённой ищется по внешнему id (steam-{appid}),
/// потом по адресу: так обновляются и игры, заведённые вручную под тем же названием, — без дублей
/// и без потери их заказов, отзывов и ключей.
///
/// При обновлении магазинные поля не трогаются: цена (если не просили), черновик/публикация,
/// витринные флаги, издания, награды, похожие игры, рейтинг по нашим отзывам.
/// </summary>
public sealed class SteamCatalogImporter(
    ISteamStoreClient steam,
    ISteamSpyClient steamSpy,
    ISteamCoverBuilder coverBuilder,
    ISteamMediaLocalizer mediaLocalizer,
    IGameRepository games,
    IGameDetailsRepository gameDetails,
    ICoverImages covers,
    ILogger<SteamCatalogImporter> logger) : ISteamCatalogImporter
{
    private static readonly (string Locale, string SteamLanguage)[] Translations = [("ru", "russian"), ("uk", "ukrainian"), ("pl", "polish")];

    /// <summary>
    /// За какими переводами карточки ходить. У игр — за всеми. У DLC — только на языки, которые у него есть
    /// (supported_languages): без перевода самого DLC Steam почти никогда не переводит и его страницу и отдаёт
    /// тот же английский текст, а запрос стоит 1,6 с лимита. Список языков пуст — спрашиваем всё, как у игр.
    /// </summary>
    public static IEnumerable<(string Locale, string SteamLanguage)> TranslationsFor(SteamApp en, bool isDlc)
    {
        var supported = SteamHtml.ParseLanguages(en.SupportedLanguagesHtml);
        if (!isDlc || supported.Count == 0)
        {
            return Translations;
        }
        return Translations.Where(t => supported.Any(language => string.Equals(language.Name, t.SteamLanguage, StringComparison.OrdinalIgnoreCase)));
    }

    public const string AlreadyInCatalog = "already in the catalog";

    public async Task<SteamImportItemResult> ImportAsync(string appId, SteamImportOptions options, CancellationToken ct)
    {
        try
        {
            var isDlc = !string.IsNullOrWhiteSpace(options.ParentGameId);
            // Заведённую по внешнему id — пропускаем до запросов к Steam: повторный импорт тысяч DLC
            // иначе тратил бы по запросу (1,6 с лимита) на каждое уже заведённое.
            var byExternalId = await games.GetByExternalIdAsync(SteamGameMapper.ExternalId(appId));
            if (byExternalId is not null && !options.UpdateExisting)
            {
                return new(appId, SteamImportOutcome.Skipped, byExternalId.Name, byExternalId.Id, AlreadyInCatalog);
            }

            var en = await steam.GetAppAsync(appId, "english", "us", ct);
            if (en is null)
            {
                return new(appId, SteamImportOutcome.Skipped, null, null, "not available on Steam");
            }
            if (isDlc && options.ParentFamilyAppIds is { } family && en.FullGameAppId is not null && !family.Contains(en.FullGameAppId))
            {
                return new(appId, SteamImportOutcome.Skipped, en.Name, null, $"DLC of another game ({en.FullGameAppId})");
            }

            var existing = byExternalId
                ?? (isDlc ? null : await games.GetBySlugAsync(SuperBot.WebApi.Controllers.SeoController.Slugify(SteamGameMapper.CleanName(en.Name))));
            if (existing is not null && !options.UpdateExisting)
            {
                return new(appId, SteamImportOutcome.Skipped, existing.Name, existing.Id, AlreadyInCatalog);
            }

            // Сначала дешёвая проверка: не тянуть переводы, метки и картинки игры, которую всё равно не возьмём.
            var probe = SteamGameMapper.Map(en, new Dictionary<string, SteamApp>(), [], null, DateTime.UtcNow, isDlc, options.AsSoftware);
            if (probe.SkipReason is not null)
            {
                return new(appId, SteamImportOutcome.Skipped, en.Name, existing?.Id, probe.SkipReason);
            }

            var localized = new Dictionary<string, SteamApp>();
            foreach (var (locale, language) in TranslationsFor(en, isDlc))
            {
                var translated = await steam.GetAppAsync(appId, language, "us", ct);
                if (translated is not null)
                {
                    localized[locale] = translated;
                }
            }
            // У DLC меток SteamSpy нет (они у игры), а трейлер — по желанию: см. IncludeTrailers.
            IReadOnlyList<string> tags = isDlc ? [] : await steamSpy.GetTagsAsync(appId, ct);
            // Ролики из других регионов — только для игр: у трёх четвертей DLC роликов нет вовсе, и два лишних
            // запроса на каждое (3,2 с лимита) удлинили бы импорт всех DLC на несколько часов.
            en = !options.IncludeTrailers ? en with { Movies = [] } : isDlc ? en : await WithMoviesFromOtherRegionsAsync(en, ct);

            var existingDetails = existing?.Id is null ? null : await gameDetails.GetByGameIdAsync(existing.Id);
            var coverUrl = KeepsCover(existing, options) ? existing!.ImagePath : await coverBuilder.BuildAsync(appId, en.Name, ct);

            var mapped = SteamGameMapper.Map(en, localized, tags, coverUrl, DateTime.UtcNow, isDlc, options.AsSoftware);
            if (mapped.Game is null || mapped.Details is null)
            {
                return new(appId, SteamImportOutcome.Skipped, en.Name, existing?.Id, mapped.SkipReason);
            }

            var game = mapped.Game;
            var details = mapped.Details;
            game.ParentGameId = isDlc ? options.ParentGameId : null;
            // Скриншоты, трейлер и картинки описаний — к себе: ссылок на CDN Steam в карточке не остаётся.
            await mediaLocalizer.LocalizeAsync(appId, details, ct);
            details.Slug = await FreeSlugAsync(details.Slug!, appId, existing?.Id);
            game.Slug = details.Slug;

            if (existing is null)
            {
                game.Id = MongoDB.Bson.ObjectId.GenerateNewId().ToString();
                await games.CreateAsync(game);
                details.GameId = game.Id;
                SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeForSave(details);
                await gameDetails.UpsertAsync(details);
                return new(appId, SteamImportOutcome.Created, game.Name, game.Id, null);
            }

            MergeShopOwnedFields(existing, existingDetails, game, details, options);
            game.Id = existing.Id;
            await games.UpdateAsync(existing.Id!, game);
            details.Id = existingDetails?.Id;
            details.GameId = existing.Id;
            SuperBot.WebApi.Services.Storefront.GameDetailsLocalizer.NormalizeForSave(details);
            await gameDetails.UpsertAsync(details);
            return new(appId, SteamImportOutcome.Updated, game.Name, existing.Id, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Steam import of app {AppId} failed", appId);
            return new(appId, SteamImportOutcome.Failed, null, null, ex.Message);
        }
    }

    /// <summary>
    /// Для США (cc=us — регион цены) Steam у части игр не отдаёт трейлеры вовсе (Steep, Vermintide 2…),
    /// хотя для других стран они есть. Тогда берём ролики из ответа для другого региона: сами файлы
    /// одинаковые, отличается только то, что Steam решает показать.
    /// </summary>
    private async Task<SteamApp> WithMoviesFromOtherRegionsAsync(SteamApp en, CancellationToken ct)
    {
        if (en.Movies.Count > 0)
        {
            return en;
        }
        foreach (var country in MovieFallbackRegions)
        {
            var other = await steam.GetAppAsync(en.AppId, "english", country, ct);
            if (other?.Movies.Count > 0)
            {
                return en with { Movies = other.Movies };
            }
        }
        return en;
    }

    private static readonly string[] MovieFallbackRegions = ["gb", "de"];

    /// <summary>Обложка уже собрана из Steam и файл на месте — второй раз не качаем.</summary>
    private bool KeepsCover(Game? existing, SteamImportOptions options)
    {
        if (existing is null || options.RefreshCovers || existing.ExternalId?.StartsWith("steam-", StringComparison.Ordinal) != true)
        {
            return false;
        }
        var relative = covers.NormalizeRelativePath(existing.ImagePath);
        return relative is not null && relative.StartsWith("images/", StringComparison.Ordinal)
            && File.Exists(Path.Combine(covers.Root, relative));
    }

    /// <summary>Адрес занят другой игрой (ремастер с тем же названием, ручной товар) — добавляем appid.</summary>
    private async Task<string> FreeSlugAsync(string slug, string appId, string? ownGameId)
    {
        var holder = await gameDetails.GetBySlugAsync(slug);
        var gameHolder = await games.GetBySlugAsync(slug);
        var takenByOther = (holder is not null && holder.GameId != ownGameId) || (gameHolder is not null && gameHolder.Id != ownGameId);
        return takenByOther ? $"{slug}-{appId}" : slug;
    }

    public static void MergeShopOwnedFields(Game existing, GameDetails? existingDetails, Game game, GameDetails details, SteamImportOptions options)
    {
        game.LowStockThreshold = existing.LowStockThreshold;
        game.LowStockFromUtc = existing.LowStockFromUtc;
        // Привязку к игре, поставленную в магазине, не трогаем; у заведённого без неё — берём из импорта DLC.
        game.ParentGameId = string.IsNullOrWhiteSpace(existing.ParentGameId) ? game.ParentGameId : existing.ParentGameId;
        game.RegionPolicy = existing.RegionPolicy;
        game.RegionPrices = existing.RegionPrices;
        game.Prices = existing.Prices;
        game.CoverMediaId = existing.CoverMediaId;
        if (!options.RefreshPrices)
        {
            game.Price = existing.Price;
            game.Currency = existing.Currency ?? game.Currency;
            details.BasePrice = existingDetails?.BasePrice > 0 ? existingDetails.BasePrice : existing.Price;
            details.FinalPrice = existingDetails?.FinalPrice > 0 ? existingDetails.FinalPrice : existing.Price;
        }

        if (existingDetails is null)
        {
            return;
        }
        details.IsDraft = existingDetails.IsDraft;
        details.IsActive = existingDetails.IsActive;
        details.ShowInFeaturedStorefront = existingDetails.ShowInFeaturedStorefront;
        details.FeaturedStorefrontPriority = existingDetails.FeaturedStorefrontPriority;
        details.DiscountPercent = existingDetails.DiscountPercent;
        details.KeyType = existingDetails.KeyType;
        details.Activation = existingDetails.Activation;
        details.KeyFeatures = existingDetails.KeyFeatures;
        details.KeyFeaturesI18n = existingDetails.KeyFeaturesI18n;
        details.Awards = existingDetails.Awards;
        details.Editions = existingDetails.Editions;
        details.DlcItems = existingDetails.DlcItems;
        details.SimilarGameIds = existingDetails.SimilarGameIds;
        details.AutoRecommendRules = existingDetails.AutoRecommendRules;
        details.RatingAvg = existingDetails.RatingAvg;
        details.ReviewsCount = existingDetails.ReviewsCount;
    }
}
