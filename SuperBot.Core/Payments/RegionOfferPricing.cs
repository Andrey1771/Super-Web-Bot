using SuperBot.Core.Entities;
using SuperBot.Core.Regions;

namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Цена регионального варианта ключа.
    ///
    /// Порядок один и тот же везде — на витрине, в корзине и на кассе: цена варианта, если она
    /// назначена, иначе цена издания, иначе цена игры. Разойтись этим трём местам нельзя: цена,
    /// показанная на карточке, обязана совпасть с той, что спишут.
    ///
    /// Региональная цена, заведённая «для игры» (без издания), относится к самой игре и к её изданию по
    /// умолчанию. К надстроечному изданию (Deluxe) она не применяется: иначе Deluxe + Europe продавался бы
    /// по цене европейского Standard.
    /// </summary>
    public static class RegionOfferPricing
    {
        /// <summary>
        /// Цена варианта в запрошенной валюте или null, если в этой валюте вариант не продаётся.
        ///
        /// Ручная цена варианта важнее пересчёта по курсу — как и у игры: назначенный человеком
        /// ценник не должен уезжать вслед за курсом.
        ///
        /// <paramref name="edition"/> — выбранное издание, если оно есть: без него цена издания
        /// не участвует, и строка «Deluxe + Europe» без своей региональной цены уходила бы по цене
        /// базовой игры (так и было — магазин терял разницу на каждом таком заказе).
        /// </summary>
        public static decimal? TryGetPrice(
            Game game,
            string? offerKey,
            string? editionCode,
            string? currency,
            FxRateBook? rates,
            FxOptions? fx,
            GameEdition? edition = null,
            bool editionIsDefault = false)
        {
            var offerPrice = FindOffer(game, offerKey, editionCode, edition is null || editionIsDefault);
            if (offerPrice is null)
            {
                // Вариантной цены нет — обычный случай: продаём по цене издания, а без издания — игры.
                return edition is null
                    ? GamePricing.TryGetPrice(game, currency, rates, fx)
                    : GamePricing.TryGetEditionPrice(edition, game, currency, rates, fx);
            }

            var requested = string.IsNullOrWhiteSpace(currency)
                ? GamePricing.BaseCurrency(game)
                : currency.Trim().ToUpperInvariant();

            if (offerPrice.Prices is not null)
            {
                foreach (var pair in offerPrice.Prices)
                {
                    if (string.Equals(pair.Key, requested, StringComparison.OrdinalIgnoreCase))
                    {
                        return pair.Value;
                    }
                }
            }

            var baseCurrency = GamePricing.BaseCurrency(game);
            if (string.Equals(requested, baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return offerPrice.Price;
            }

            if (rates is null || fx is null)
            {
                return null;
            }

            var rate = rates.For(requested);
            if (rate is null || !string.Equals(rates.BaseCurrency, baseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            return FxConversion.Convert(offerPrice.Price, rate, fx.MarkupPercent, fx.RuleFor(requested), requested);
        }

        /// <summary>
        /// Цена варианта, назначенная магазином. Сначала ищется цена для конкретного издания,
        /// потом общая для игры: у Deluxe-версии европейского ключа может быть своя цена, и
        /// более точное правило обязано побеждать.
        /// </summary>
        /// <param name="allowGameLevel">
        /// Подходит ли цена «для игры» (без издания). Да — для строки без издания и для издания по умолчанию;
        /// нет — для надстроечного издания, у которого своя цена.
        /// </param>
        public static RegionPrice? FindOffer(Game game, string? offerKey, string? editionCode, bool allowGameLevel = true)
        {
            var prices = game?.RegionPrices;
            if (prices is null || prices.Count == 0)
            {
                return null;
            }

            // Сравниваем нормализованные ключи: цена, заведённая как «политика игры», и цена,
            // заведённая как явный Global у безрегиональной игры, — это одна и та же цена.
            var key = RegionOffer.NormalizeKey(offerKey, game?.RegionPolicy);
            var edition = string.IsNullOrWhiteSpace(editionCode) ? null : editionCode.Trim();

            RegionPrice? forEdition = null;
            RegionPrice? forGame = null;

            foreach (var price in prices)
            {
                if (!string.Equals(RegionOffer.NormalizeKey(price.OfferKey, game?.RegionPolicy), key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (edition is not null && string.Equals(price.EditionCode, edition, StringComparison.OrdinalIgnoreCase))
                {
                    forEdition = price;
                }
                else if (string.IsNullOrWhiteSpace(price.EditionCode))
                {
                    forGame = price;
                }
            }

            return forEdition ?? (allowGameLevel ? forGame : null);
        }
    }
}
