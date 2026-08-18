using SuperBot.Core.Entities;

namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Выбор цены игры в запрошенной валюте. Единственное место, где принимается это решение:
    /// раньше цена была одним числом без валюты, и любой вызывающий мог трактовать её как угодно.
    ///
    /// Правило простое и намеренно без конвертации:
    ///   * запрошена базовая валюта игры — цена из <see cref="Game.Price"/>;
    ///   * запрошена другая валюта — цена из ручного прайс-листа <see cref="Game.Prices"/>;
    ///   * цены нет — отказ. Пересчёт по курсу появится на Этапе 4 и встроится сюда же,
    ///     чтобы места принятия решения так и осталось одно.
    ///
    /// Конвертации здесь нет сознательно: показать цену, которой не существует, хуже,
    /// чем не показать валюту вовсе.
    /// </summary>
    public static class GamePricing
    {
        /// <summary>Валюта каталога у записей, заведённых до мультивалютности.</summary>
        public const string LegacyCurrency = "USD";

        /// <summary>Валюта базовой цены игры. Пусто у старых записей — это USD.</summary>
        public static string BaseCurrency(Game game) =>
            string.IsNullOrWhiteSpace(game?.Currency) ? LegacyCurrency : game!.Currency!.Trim().ToUpperInvariant();

        /// <summary>
        /// Цена игры в запрошенной валюте: ручная из прайс-листа, иначе пересчёт по курсу.
        ///
        /// Ручная цена всегда важнее курса — её назначил человек, и «красивый» ценник рынка
        /// не должен уезжать вслед за колебаниями. Пересчёт нужен только там, где руками
        /// не завели: он даёт цену там, где иначе товара просто не было бы.
        /// </summary>
        public static decimal? TryGetPrice(Game game, string? currency, FxRateBook? rates, FxOptions? fx)
        {
            var manual = TryGetPrice(game, currency);
            if (manual is not null)
            {
                return manual;
            }

            if (rates is null || fx is null || game is null)
            {
                return null;
            }

            var requested = string.IsNullOrWhiteSpace(currency)
                ? BaseCurrency(game)
                : currency.Trim().ToUpperInvariant();

            // Пересчитываем от базовой цены игры, а не от чужой валюты прайс-листа: цепочка
            // конверсий копит погрешность и делает цену необъяснимой.
            var rate = rates.For(requested);
            if (rate is null || !string.Equals(rates.BaseCurrency, BaseCurrency(game), StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            return FxConversion.Convert(game.Price, rate, fx.MarkupPercent, fx.RuleFor(requested), requested);
        }

        /// <summary>
        /// Цена игры в запрошенной валюте или null, если её нет. Null — это «не продаём в этой
        /// валюте», а не «бесплатно»: вызывающий обязан отказать, а не подставить ноль.
        /// </summary>
        public static decimal? TryGetPrice(Game game, string? currency)
        {
            if (game is null)
            {
                return null;
            }

            var requested = string.IsNullOrWhiteSpace(currency)
                ? BaseCurrency(game)
                : currency.Trim().ToUpperInvariant();

            if (string.Equals(requested, BaseCurrency(game), StringComparison.OrdinalIgnoreCase))
            {
                return game.Price;
            }

            if (game.Prices is null)
            {
                return null;
            }

            // Ключи прайс-листа приходят из Mongo и из админки — регистр там никто не гарантирует.
            foreach (var (code, price) in game.Prices)
            {
                if (string.Equals(code?.Trim(), requested, StringComparison.OrdinalIgnoreCase))
                {
                    return price;
                }
            }

            return null;
        }

        /// <summary>Валюты, в которых игру можно продать: базовая плюс все из прайс-листа.</summary>
        public static IReadOnlyCollection<string> AvailableCurrencies(Game game)
        {
            var currencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { BaseCurrency(game) };

            if (game?.Prices is not null)
            {
                foreach (var code in game.Prices.Keys)
                {
                    if (!string.IsNullOrWhiteSpace(code))
                    {
                        currencies.Add(code.Trim().ToUpperInvariant());
                    }
                }
            }

            return currencies;
        }
    }
}
