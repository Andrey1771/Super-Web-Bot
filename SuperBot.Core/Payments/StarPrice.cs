namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Пересчёт цены из USD в Telegram Stars (XTR). Ставка настраивается (BotPayments:StarsPerUsd).
    /// Это демо-конвертация для оплаты внутри бота — не биржевой курс.
    /// </summary>
    public static class StarPrice
    {
        public const int DefaultStarsPerUsd = 50;

        /// <summary>Валюта, к которой привязана ставка звёзд.</summary>
        public const string RateCurrency = "USD";

        /// <summary>
        /// Цена в звёздах для суммы в произвольной валюте: сначала приводим к USD, потом в звёзды.
        ///
        /// Ставка «звёзд за доллар» одна на весь бот — отдельной ставки «звёзд за евро» мы не держим
        /// сознательно: иначе один и тот же товар стоил бы разное число звёзд в разных странах,
        /// хотя звёзды покупаются у Telegram по единой цене.
        ///
        /// Null означает «в звёздах не продаём»: пересчитать нечем. Раньше сюда приходила
        /// <c>game.Price</c> как «просто число», и цена в звёздах молча считалась от евро
        /// по долларовой ставке.
        /// </summary>
        public static int? FromAmount(decimal amount, string? currency, FxRateBook? rates, int starsPerUsd = DefaultStarsPerUsd)
        {
            var usd = ToUsd(amount, currency, rates);
            return usd is null ? null : FromUsd(usd.Value, starsPerUsd);
        }

        /// <summary>
        /// Приводит сумму к долларам. Цепочки конверсий не строим: две конверсии подряд копят
        /// погрешность, а цена в звёздах и так демонстрационная.
        /// </summary>
        private static decimal? ToUsd(decimal amount, string? currency, FxRateBook? rates)
        {
            var code = string.IsNullOrWhiteSpace(currency)
                ? RateCurrency
                : currency.Trim().ToUpperInvariant();

            if (string.Equals(code, RateCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return amount;
            }

            if (rates is null)
            {
                return null;
            }

            // Курсы считаны от долларов: rate — сколько единиц валюты даёт доллар.
            if (string.Equals(rates.BaseCurrency, RateCurrency, StringComparison.OrdinalIgnoreCase))
            {
                var rate = rates.For(code);
                return rate is null || rate.Rate <= 0 ? null : amount / rate.Rate;
            }

            // Курсы считаны от другой валюты, а сумма как раз в ней — берём курс к доллару.
            if (string.Equals(rates.BaseCurrency, code, StringComparison.OrdinalIgnoreCase))
            {
                var toUsd = rates.For(RateCurrency);
                return toUsd is null || toUsd.Rate <= 0 ? null : amount * toUsd.Rate;
            }

            return null;
        }

        public static int FromUsd(decimal usd, int starsPerUsd = DefaultStarsPerUsd)
        {
            if (starsPerUsd <= 0)
            {
                starsPerUsd = DefaultStarsPerUsd;
            }

            var stars = (int)Math.Round(usd * starsPerUsd, MidpointRounding.AwayFromZero);
            return Math.Max(1, stars); // Telegram требует минимум 1 звезду
        }
    }
}
