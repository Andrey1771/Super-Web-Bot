using SuperBot.Core.Payments;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Приведение каталога к валюте покупателя.
///
/// Снапшот собирается один на всех и хранит цены в базовой валюте игры плюс ручной прайс-лист.
/// Валюта у каждого посетителя своя, поэтому перед отбором и показом позиции переводятся
/// в запрошенную валюту — один дешёвый проход по списку вместо отдельного снапшота на валюту.
///
/// Позиция, у которой в этой валюте цены нет, из выдачи убирается. Это сознательный выбор:
/// показать цену, которую нельзя списать, значит вернуть ровно то расхождение витрины и чекаута,
/// ради устранения которого всё затевалось. На практике до этого не доходит — валюту включают
/// в конфигурации только когда прайс-листы заполнены.
/// </summary>
public static class CatalogPricing
{
    /// <summary>Каталог в запрошенной валюте; позиции без цены в ней отбрасываются.</summary>
    public static IReadOnlyList<CatalogItem> InCurrency(
        IReadOnlyList<CatalogItem> catalog,
        string currency,
        FxRateBook? rates = null,
        FxOptions? fx = null)
    {
        var result = new List<CatalogItem>(catalog.Count);

        foreach (var item in catalog)
        {
            var converted = InCurrency(item, currency, rates, fx);
            if (converted is not null)
            {
                result.Add(converted);
            }
        }

        return result;
    }

    /// <summary>Позиция в запрошенной валюте или null, если цены в ней нет.</summary>
    public static CatalogItem? InCurrency(
        CatalogItem item,
        string currency,
        FxRateBook? rates = null,
        FxOptions? fx = null)
    {
        if (string.Equals(item.Currency, currency, StringComparison.OrdinalIgnoreCase))
        {
            return item;
        }

        // Сначала ручная цена и только потом пересчёт: ценник, назначенный человеком,
        // не должен уезжать вслед за курсом.
        var price = FindPrice(item.Prices, currency)
            ?? FxConversion.Convert(
                item.Price,
                rates?.For(currency),
                fx?.MarkupPercent ?? 0m,
                fx?.RuleFor(currency) ?? PriceRoundingRule.None,
                currency);

        if (price is null)
        {
            return null;
        }

        // Скидка — процент, она валютно-нейтральна: пересчитывать её не нужно, нужно применить
        // к цене этой валюты. Иначе итоговая цена приехала бы из другой валюты.
        return item with
        {
            Price = price.Value,
            FinalPrice = PriceCalculator.FinalPrice(price.Value, item.DiscountPercent),
            Currency = currency
        };
    }

    private static decimal? FindPrice(IReadOnlyDictionary<string, decimal> prices, string currency)
    {
        foreach (var (code, price) in prices)
        {
            if (string.Equals(code?.Trim(), currency, StringComparison.OrdinalIgnoreCase))
            {
                return price;
            }
        }

        return null;
    }
}
