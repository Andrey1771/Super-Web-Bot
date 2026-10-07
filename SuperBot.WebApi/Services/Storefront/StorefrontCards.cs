using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>
/// Карточка товара для витрины — одна на всё: полки главной, сетку каталога и «похожие» на странице
/// игры. Раньше «похожие» отдавали урезанный вариант (без платформ, наличия и статуса скидки),
/// и витрине приходилось рисовать для них отдельную карточку.
/// </summary>
public static class StorefrontCards
{
    public static object ToCardDto(
        CatalogItem item,
        SuperBot.Core.Regions.RegionCatalog regionCatalog,
        string? buyerCountry,
        IReadOnlyDictionary<string, SuperBot.Core.Interfaces.IRepositories.KeyActivationInfo>? activation = null,
        // Названия жанра/категории на языке покупателя; null — английские из снимка.
        TaxonomyTitles? titles = null)
    {
        // Регион считаем по доступным ключам: партия может быть ограничена сильнее игры.
        SuperBot.Core.Interfaces.IRepositories.KeyActivationInfo? stock = null;
        if (activation is not null && item.Id is not null && activation.TryGetValue(item.Id, out var found))
        {
            stock = found;
        }
        var region = SuperBot.WebApi.Services.Regions.RegionSummary.BuildForKeys(
            stock?.KeyPolicies, item.RegionPolicy, regionCatalog, buyerCountry);
        return new
        {
        id = item.Id,
        slug = item.Slug,
        name = item.Name,
        description = titles?.DescriptionOf(item) ?? item.Description,
        title = item.Title,
        parentGameId = item.ParentGameId,
        isDlc = item.ParentGameId is not null,
        dlcCount = item.DlcCount,
        parentTitle = item.ParentTitle,
        gameType = item.GameType,
        genre = item.Genre,
        kind = item.Kind.ToString(),
        softwareCategory = item.SoftwareCategory,
        isDraft = item.IsDraft,
        // Лицензия, чья цена на карточке («1 year · 3 devices»), и сколько ещё вариантов («+4 licenses»).
        // priceFrom — цена «от»: у товара больше одной лицензии.
        license = SoftwareLicenses.Current(item) is { } current
            ? new
            {
                code = current.Code,
                label = current.Label ?? current.Title,
                // Срок и устройства отдельно: подпись на языке покупателя собирает витрина, label — запас.
                termMonths = current.TermMonths,
                devices = current.Devices,
                isSubscription = current.IsSubscription
            }
            : null,
        licenseCount = item.Licenses?.Count ?? 0,
        priceFrom = item.Licenses is { Count: > 1 },
        activation = item.Activation?.ToString(),
        category = titles?.CategoryOf(item) ?? item.Category,
        imagePath = item.ImagePath,
        coverMediaId = item.CoverMediaId,
        // Трейлер для превью при наведении на плитку; null — видео у товара нет.
        trailerUrl = item.TrailerUrl,
        trailerPosterUrl = item.TrailerPosterUrl,
        releaseDate = item.ReleaseDate,
        isComingSoon = item.IsComingSoon,
        price = item.Price,
        finalPrice = item.FinalPrice,
        // Валюта едет вместе с ценой: витрина форматирует ровно то, что ей дали,
        // и разойтись с расчётом уже не может.
        currency = item.Currency,
        discountPercent = item.DiscountPercent,
        discountActive = item.DiscountActive,
        // Когда скидка закончится (UTC) — витрина рисует обратный отсчёт «deal ends in…».
        discountEndsAt = item.DiscountEndsAt,
        genres = titles?.GenresOf(item) ?? item.Genres,
        platforms = item.Platforms,
        rating = item.Rating,
        reviewCount = item.ReviewCount,
        inStock = item.InStock,
        lowStockLeft = item.LowStockLeft,
        showInFeaturedStorefront = item.ShowInFeaturedStorefront,
        featuredStorefrontPriority = item.FeaturedStorefrontPriority,
        // Регион отдаём только там, где он что-то ограничивает: у товара «работает везде»
        // бейдж не сообщает ничего и лишь съедает место в карточке.
        region = region.IsRestricted
            ? new
            {
                badge = region.Badge,
                summary = region.Summary,
                exclusions = region.Exclusions,
                kind = region.Kind,
                regionNames = region.RegionNames,
                excludedCountries = region.ExcludedCountries,
                allowed = region.Allowed
            }
            : null
        };
    }
}
