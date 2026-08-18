namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Как округлять цену, полученную пересчётом по курсу. Правило задаётся на валюту:
    /// «54.99 €» и «6 500 ¥» — разные привычки рынка, и одна формула для обоих не годится.
    /// </summary>
    public enum PriceRoundingRule
    {
        /// <summary>До ближайшего .99 вверх: 54.37 → 54.99. Привычный ценник западных магазинов.</summary>
        NinetyNine,
        /// <summary>Вверх до десятка: 6 432 → 6 440. Для валют без копеек с мелким номиналом.</summary>
        Ten,
        /// <summary>Вверх до сотни: 6 432 → 6 500. Для валют, где сотня — привычный шаг цены.</summary>
        Hundred,
        /// <summary>Только до точности валюты, без «красивого» шага.</summary>
        None
    }

    /// <summary>
    /// Округление цены после пересчёта по курсу — всегда **вверх**.
    ///
    /// Вверх, а не «к ближайшему», по двум причинам: округление вниз означает продать дешевле
    /// назначенного (курсовые потери на каждой покупке), и оно же делает цену непредсказуемой
    /// для маркетинга — 54.99 после пересчёта должно оставаться ценником, а не превращаться
    /// в 54.37.
    /// </summary>
    public static class PriceRounding
    {
        public static decimal Apply(decimal amount, PriceRoundingRule rule, string? currency)
        {
            if (amount <= 0)
            {
                return 0m;
            }

            return rule switch
            {
                PriceRoundingRule.NinetyNine => ToNinetyNine(amount),
                PriceRoundingRule.Ten => UpToStep(amount, 10m),
                PriceRoundingRule.Hundred => UpToStep(amount, 100m),
                _ => UpToCurrencyPrecision(amount, currency)
            };
        }

        /// <summary>Ближайший .99 не ниже суммы: 54.00 → 54.99, 54.99 → 54.99, 55.01 → 55.99.</summary>
        private static decimal ToNinetyNine(decimal amount)
        {
            var candidate = Math.Floor(amount) + 0.99m;
            return candidate >= amount ? candidate : candidate + 1m;
        }

        private static decimal UpToStep(decimal amount, decimal step) =>
            Math.Ceiling(amount / step) * step;

        /// <summary>
        /// Вверх до последнего разряда валюты. Обычное <see cref="CurrencyMinorUnits.Round"/>
        /// здесь не подходит: оно округляет к ближайшему и может уронить цену ниже назначенной.
        /// </summary>
        private static decimal UpToCurrencyPrecision(decimal amount, string? currency)
        {
            var exponent = CurrencyMinorUnits.Exponent(currency);
            var factor = exponent switch
            {
                0 => 1m,
                3 => 1000m,
                _ => 100m
            };

            return Math.Ceiling(amount * factor) / factor;
        }
    }
}
