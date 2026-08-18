namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Набор курсов на один момент времени и правила его обновления.
    ///
    /// Чистая логика без базы и сети: решение «принять новый курс или оставить прежний»
    /// проверяется тестами, а не наблюдением за продакшеном.
    /// </summary>
    public sealed class FxRateBook
    {
        private readonly Dictionary<string, FxRate> _rates = new(StringComparer.OrdinalIgnoreCase);

        public FxRateBook(string baseCurrency, IEnumerable<FxRate>? rates = null)
        {
            BaseCurrency = string.IsNullOrWhiteSpace(baseCurrency)
                ? GamePricing.LegacyCurrency
                : baseCurrency.Trim().ToUpperInvariant();

            foreach (var rate in rates ?? Enumerable.Empty<FxRate>())
            {
                _rates[rate.To] = rate;
            }
        }

        public string BaseCurrency { get; }

        /// <summary>Курс базовой валюты к целевой или null, если его нет.</summary>
        public FxRate? For(string currency)
        {
            if (string.IsNullOrWhiteSpace(currency))
            {
                return null;
            }

            // Курс валюты к самой себе — единица, и хранить его незачем.
            if (string.Equals(currency.Trim(), BaseCurrency, StringComparison.OrdinalIgnoreCase))
            {
                return new FxRate(BaseCurrency, BaseCurrency, 1m, DateTime.UtcNow);
            }

            return _rates.TryGetValue(currency.Trim(), out var rate) ? rate : null;
        }

        /// <summary>Все известные курсы — для сохранения снимка.</summary>
        public IReadOnlyCollection<FxRate> All() => _rates.Values.ToList();

        /// <summary>
        /// Итог проверки нового курса. Отклонённый курс — не ошибка обработки: прежний курс
        /// остаётся в силе, магазин продолжает работать, а разбираться идёт человек.
        /// </summary>
        public sealed record RateUpdate(FxRate Rate, bool Accepted, decimal ChangePercent, string? Reason);

        /// <summary>
        /// Принимает новый курс, если он не слишком отличается от прежнего.
        /// Первый курс валюты принимается всегда — сравнивать его не с чем.
        /// </summary>
        public RateUpdate Offer(FxRate incoming, decimal maxChangePercent)
        {
            if (incoming.Rate <= 0)
            {
                return new RateUpdate(incoming, false, 0m, "Rate must be greater than zero.");
            }

            var previous = _rates.TryGetValue(incoming.To, out var known) ? known : null;
            if (previous is null)
            {
                _rates[incoming.To] = incoming;
                return new RateUpdate(incoming, true, 0m, null);
            }

            var change = FxConversion.ChangePercent(previous.Rate, incoming.Rate);
            if (change > maxChangePercent)
            {
                // Прежний курс остаётся: лучше торговать по вчерашнему курсу, чем по сломанному.
                return new RateUpdate(
                    previous,
                    false,
                    change,
                    $"Rate for {incoming.To} moved {change:F1}% — over the {maxChangePercent:F1}% guard.");
            }

            _rates[incoming.To] = incoming;
            return new RateUpdate(incoming, true, change, null);
        }
    }
}
