namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Минимальная сумма платежа, которую Stripe проводит в каждой валюте (https://stripe.com/docs/currencies#minimum-and-maximum-charge-amounts).
    /// Нужна кассе, когда часть заказа оплачена кэшбэком: остаток на карту не может быть меньше этого порога —
    /// иначе Stripe отклонит намерение уже после того, как кэшбэк отложен под платёж.
    ///
    /// Порог проверяется в валюте ВЫПЛАТ аккаунта, а не в валюте платежа: у аккаунта в евро платёж $0.50
    /// отклоняется («$0.50 converts to approximately €0.44»), хотя для долларов $0.50 — ровно минимум.
    /// Поэтому <see cref="For(string?, string?, FxRateBook?)"/> переводит минимум валюты выплат в валюту платежа.
    /// </summary>
    public static class StripeMinimumCharge
    {
        private static readonly Dictionary<string, decimal> Minimums = new(StringComparer.OrdinalIgnoreCase)
        {
            ["USD"] = 0.50m, ["EUR"] = 0.50m, ["GBP"] = 0.30m, ["AUD"] = 0.50m, ["BGN"] = 1.00m,
            ["BRL"] = 0.50m, ["CAD"] = 0.50m, ["CHF"] = 0.50m, ["CZK"] = 15.00m, ["DKK"] = 2.50m,
            ["HKD"] = 4.00m, ["HUF"] = 175.00m, ["INR"] = 0.50m, ["JPY"] = 50m, ["MXN"] = 10m,
            ["MYR"] = 2m, ["NOK"] = 3.00m, ["NZD"] = 0.50m, ["PLN"] = 2.00m, ["RON"] = 2.00m,
            ["SEK"] = 3.00m, ["SGD"] = 0.50m, ["THB"] = 10m, ["AED"] = 2.00m
        };

        /// <summary>Порог по умолчанию для валюты, которой нет в таблице: как у доллара.</summary>
        public const decimal Fallback = 0.50m;

        /// <summary>
        /// Запас на расхождение курсов: Stripe пересчитывает по своему курсу, и он отличается от нашего на проценты.
        /// Десять процентов перекрывают это с запасом и стоят покупателю несколько центов кэшбэка.
        /// </summary>
        public const decimal ConversionBuffer = 1.10m;

        /// <summary>
        /// Во сколько раз поднять порог, если валюта выплат другая, а курса к ней нет. Грубо, зато платёж пройдёт:
        /// для валют с близким минимумом (доллар, евро, фунт, франк) двойного порога хватает.
        /// </summary>
        public const decimal UnknownRateMultiplier = 2m;

        /// <summary>Минимум в самой валюте, без учёта валюты выплат аккаунта.</summary>
        public static decimal For(string? currency) =>
            !string.IsNullOrWhiteSpace(currency) && Minimums.TryGetValue(currency.Trim(), out var minimum) ? minimum : Fallback;

        /// <summary>
        /// Минимум платежа в <paramref name="chargeCurrency"/> для аккаунта с выплатами в <paramref name="settlementCurrency"/>.
        /// Валюта выплат неизвестна или совпадает с валютой платежа — таблица. Иначе — минимум валюты выплат, переведённый
        /// через курсы (без наценки: она делает витринную цену, а не курс Stripe) с запасом <see cref="ConversionBuffer"/>
        /// и округлённый вверх до минорной единицы; но не ниже табличного минимума самой валюты платежа.
        /// </summary>
        public static decimal For(string? chargeCurrency, string? settlementCurrency, FxRateBook? rates)
        {
            var own = For(chargeCurrency);
            if (string.IsNullOrWhiteSpace(settlementCurrency)
                || string.IsNullOrWhiteSpace(chargeCurrency)
                || string.Equals(chargeCurrency.Trim(), settlementCurrency.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return own;
            }

            var converted = Convert(For(settlementCurrency), settlementCurrency.Trim(), chargeCurrency.Trim(), rates);
            if (converted is null)
            {
                return RoundUp(own * UnknownRateMultiplier, chargeCurrency);
            }

            return Math.Max(own, RoundUp(converted.Value * ConversionBuffer, chargeCurrency));
        }

        /// <summary>Перевод через базовую валюту книги курсов: из валюты в базовую, из базовой в целевую.</summary>
        private static decimal? Convert(decimal amount, string from, string to, FxRateBook? rates)
        {
            if (rates is null)
            {
                return null;
            }
            var fromRate = rates.For(from)?.Rate;
            var toRate = rates.For(to)?.Rate;
            if (fromRate is not > 0 || toRate is not > 0)
            {
                return null;
            }
            return amount / fromRate.Value * toRate.Value;
        }

        private static decimal RoundUp(decimal amount, string? currency)
        {
            var factor = CurrencyMinorUnits.ToMinor(1m, currency);
            return Math.Ceiling(amount * factor) / factor;
        }
    }
}
