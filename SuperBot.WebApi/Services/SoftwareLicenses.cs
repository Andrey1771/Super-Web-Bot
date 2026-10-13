using SuperBot.Core.Entities;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Цена карточки ПО. У товара несколько лицензий, а карточка в сетке одна — показываем цену «from»: самую дешёвую
/// лицензию из тех, что подходят под выбранные фильтры (срок, устройства), с предпочтением тех, что есть на складе.
/// По этой же цене работают фильтр и сортировка по цене — иначе карточка «from $4.99» стояла бы среди «дороже $20».
/// </summary>
public static class SoftwareLicenses
{
    /// <summary>Лицензии товара из изданий карточки. Издания без кода не продаются — их пропускаем.</summary>
    public static IReadOnlyList<CatalogLicense> Build(
        GameDetails? details,
        decimal? gameDiscountPercent,
        DateTime? gameDiscountEndsAt,
        IReadOnlyDictionary<string, int>? availableByEdition,
        bool stockKnown,
        int lowStockThreshold = 0,
        bool forcedLowStock = false)
    {
        var editions = GameEditions.Sellable(details?.Editions);
        if (editions.Count == 0)
        {
            return Array.Empty<CatalogLicense>();
        }

        return editions.Select(edition =>
        {
            var isDefault = GameEditions.IsDefaultIn(editions, edition);
            var available = GameEditions.AvailableFor(availableByEdition, edition, isDefault);
            var ownDiscount = edition.DiscountPercent is > 0;
            var discount = ownDiscount ? edition.DiscountPercent : gameDiscountPercent;
            return new CatalogLicense(
                Code: edition.Code!,
                Title: edition.Title ?? edition.Code!,
                Label: SoftwareCatalog.LicenseLabel(edition),
                TermMonths: edition.LicenseTermMonths,
                Devices: edition.LicenseDevices,
                IsSubscription: edition.IsSubscription,
                IsDefault: isDefault,
                Price: edition.Price,
                FinalPrice: PriceCalculator.FinalPrice(edition.Price, discount),
                Prices: edition.Prices ?? new Dictionary<string, decimal>(),
                DiscountPercent: discount is > 0 ? discount : null,
                OwnDiscount: ownDiscount,
                DiscountEndsAt: !ownDiscount && discount is > 0 ? gameDiscountEndsAt : null,
                InStock: !stockKnown || available > 0,
                // Те же правила «мало», что у игры: порог товара или общий, либо принудительно с даты из админки.
                LowStockLeft: stockKnown && available > 0 && (available <= lowStockThreshold || forcedLowStock) ? available : null);
        }).ToList();
    }

    /// <summary>
    /// Позиция с ценой лучшей подходящей лицензии. Нет лицензий или ни одна не подошла — позиция без изменений
    /// (отбор по фильтрам делает сам каталог).
    /// </summary>
    public static CatalogItem Represent(CatalogItem item, Func<CatalogLicense, bool>? matches = null)
    {
        if (item.Licenses is not { Count: > 0 } licenses)
        {
            return item;
        }

        // Подходящие под фильтры лицензии: и цена, и наличие — про них. Раньше наличие бралось по всем лицензиям
        // товара, и распроданная годовая лицензия проходила фильтр «в наличии» за счёт бессрочной.
        var pool = matches is null ? licenses : licenses.Where(matches).ToList();
        var best = pool
            .OrderBy(license => license.InStock ? 0 : 1)
            .ThenBy(license => license.FinalPrice)
            .ThenBy(license => license.IsDefault ? 0 : 1)
            .FirstOrDefault();
        if (best is null)
        {
            return item;
        }

        var discounted = best.DiscountPercent is > 0 && best.FinalPrice < best.Price;
        return item with
        {
            Price = best.Price,
            FinalPrice = best.FinalPrice,
            DiscountPercent = discounted ? best.DiscountPercent : null,
            DiscountActive = discounted,
            DiscountEndsAt = discounted ? best.DiscountEndsAt : null,
            InStock = pool.Any(license => license.InStock),
            // «N left» — про лицензию, чья цена на карточке: у товара в целом может быть много ключей другой лицензии.
            LowStockLeft = best.LowStockLeft,
            LicenseCode = best.Code
        };
    }

    /// <summary>Лицензия, чья цена стоит в позиции.</summary>
    public static CatalogLicense? Current(CatalogItem item) =>
        item.Licenses?.FirstOrDefault(license => string.Equals(license.Code, item.LicenseCode, StringComparison.OrdinalIgnoreCase));
}
