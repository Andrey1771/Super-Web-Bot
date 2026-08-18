namespace SuperBot.Core.Payments
{
    /// <summary>Курс на момент снимка: сколько единиц <see cref="To"/> даёт одна единица <see cref="From"/>.</summary>
    public sealed record FxRate(string From, string To, decimal Rate, DateTime CapturedAtUtc);

    /// <summary>
    /// Пересчёт цены из базовой валюты в другую: курс → наценка → округление вверх.
    ///
    /// Наценка нужна не из жадности: между показом цены и списанием проходит время, курс успевает
    /// уехать, а провайдер берёт свою комиссию за конверсию. Без запаса каждая покупка в неосновной
    /// валюте продаётся немного дешевле, чем назначено, и это видно только в отчёте за квартал.
    ///
    /// Порядок операций важен: наценка накладывается на сырой пересчёт, а «красивый» ценник
    /// получается последним. Округлить сначала, а потом добавить проценты — значит снова получить
    /// 54.37 вместо 54.99.
    /// </summary>
    public static class FxConversion
    {
        /// <summary>
        /// Цена в целевой валюте или null, если пересчитать нечем.
        /// </summary>
        /// <param name="amount">Сумма в исходной валюте.</param>
        /// <param name="rate">Курс. Null означает «курса нет» — вызывающий обязан отказать.</param>
        /// <param name="markupPercent">Надбавка в процентах: 3 означает +3 %.</param>
        /// <param name="rule">Правило округления целевой валюты.</param>
        /// <param name="targetCurrency">Целевая валюта — её точность используется при округлении.</param>
        public static decimal? Convert(
            decimal amount,
            FxRate? rate,
            decimal markupPercent,
            PriceRoundingRule rule,
            string targetCurrency)
        {
            if (rate is null || rate.Rate <= 0)
            {
                return null;
            }

            if (amount <= 0)
            {
                // Бесплатная позиция остаётся бесплатной: наценка на ноль — всё равно ноль,
                // а округление вверх сделало бы её платной.
                return 0m;
            }

            var converted = amount * rate.Rate;
            var withMarkup = converted * (1m + markupPercent / 100m);

            return PriceRounding.Apply(withMarkup, rule, targetCurrency);
        }

        /// <summary>
        /// Насколько новый курс отличается от прежнего, в процентах. Нужен гарду: скачок обычно
        /// означает сбой источника, а не движение рынка, и применять его автоматически нельзя —
        /// цены всего каталога уедут на порядок.
        /// </summary>
        public static decimal ChangePercent(decimal previousRate, decimal nextRate)
        {
            if (previousRate <= 0)
            {
                return 0m;
            }

            return Math.Abs(nextRate - previousRate) / previousRate * 100m;
        }
    }
}
