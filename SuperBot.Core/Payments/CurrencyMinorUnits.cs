namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Перевод суммы в минорные единицы (центы) для платёжных провайдеров.
    /// Раньше по всему коду стояло «умножить на 100» — это верно только для валют с двумя
    /// знаками. Для JPY/KRW и для Telegram Stars (XTR) множитель равен 1, и прибитая сотня
    /// завышала бы сумму в сто раз. Здесь единственное место, где живёт это знание.
    /// </summary>
    public static class CurrencyMinorUnits
    {
        /// <summary>
        /// Валюты без дробной части. Список синхронизирован со списком zero-decimal валют Stripe,
        /// плюс XTR (Telegram Stars): звёзды считаются целыми штуками.
        /// </summary>
        private static readonly HashSet<string> ZeroDecimalCurrencies = new(StringComparer.OrdinalIgnoreCase)
        {
            "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
            "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
            "XTR"
        };

        /// <summary>
        /// Валюты с тремя знаками после запятой. Внимание: Stripe для них требует, чтобы младший
        /// разряд был нулевым (сумма кратна 10 минорным единицам) — учитывать при подключении.
        /// </summary>
        private static readonly HashSet<string> ThreeDecimalCurrencies = new(StringComparer.OrdinalIgnoreCase)
        {
            "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"
        };

        /// <summary>Число знаков после запятой у валюты. Неизвестная валюта считается двузначной.</summary>
        public static int Exponent(string? currency)
        {
            if (string.IsNullOrWhiteSpace(currency))
            {
                return 2;
            }

            var code = currency.Trim();
            if (ZeroDecimalCurrencies.Contains(code))
            {
                return 0;
            }

            return ThreeDecimalCurrencies.Contains(code) ? 3 : 2;
        }

        /// <summary>Округляет сумму до точности, допустимой в этой валюте.</summary>
        public static decimal Round(decimal amount, string? currency)
            => Math.Round(amount, Exponent(currency), MidpointRounding.AwayFromZero);

        /// <summary>
        /// Сумма в минорных единицах. Считается ровно один раз на заказ — дальше её никто
        /// не пересчитывает, чтобы витрина, платёж и чек не разъехались на округлении.
        /// </summary>
        public static long ToMinor(decimal amount, string? currency)
        {
            var factor = Factor(Exponent(currency));
            return (long)Math.Round(amount * factor, MidpointRounding.AwayFromZero);
        }

        /// <summary>Обратный перевод — из минорных единиц в сумму валюты.</summary>
        public static decimal FromMinor(long minorUnits, string? currency)
            => minorUnits / Factor(Exponent(currency));

        private static decimal Factor(int exponent) => exponent switch
        {
            0 => 1m,
            3 => 1000m,
            _ => 100m
        };
    }
}
