namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Какие валюты магазин имеет право показывать и в какой ведёт каталог.
    ///
    /// Список задаётся конфигурацией, а не выводится из данных. Причина: если считать
    /// поддерживаемыми все валюты, встреченные в прайс-листах, то одна игра с ценой в EUR
    /// включила бы евро на весь магазин — и чекаут падал бы на любой корзине, где у соседнего
    /// товара цены в евро нет. Валюту включают руками, когда прайс-листы заполнены.
    ///
    /// Секция конфигурации — <c>Storefront</c>.
    /// </summary>
    public class StorefrontCurrencyOptions
    {
        /// <summary>Валюта каталога и списания по умолчанию.</summary>
        public string BaseCurrency { get; set; } = GamePricing.LegacyCurrency;

        /// <summary>
        /// Валюты, доступные покупателю. Базовая добавляется всегда, даже если её забыли
        /// вписать: магазин без валюты расчёта работать не может.
        /// </summary>
        public List<string> SupportedCurrencies { get; set; } = new();

        /// <summary>Нормализованная базовая валюта: верхний регистр, без пробелов.</summary>
        public string Base =>
            string.IsNullOrWhiteSpace(BaseCurrency)
                ? GamePricing.LegacyCurrency
                : BaseCurrency.Trim().ToUpperInvariant();

        /// <summary>Валюты витрины: базовая первой, дальше остальные в порядке настройки.</summary>
        public IReadOnlyList<string> Supported()
        {
            var result = new List<string> { Base };

            foreach (var code in SupportedCurrencies)
            {
                if (string.IsNullOrWhiteSpace(code))
                {
                    continue;
                }

                var normalized = code.Trim().ToUpperInvariant();
                if (!result.Contains(normalized, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add(normalized);
                }
            }

            return result;
        }

        /// <summary>
        /// Приводит запрошенную валюту к поддерживаемой. Неизвестная или пустая — базовая:
        /// показать чужую валюту хуже, чем показать базовую, а отказывать в выдаче каталога
        /// из-за кривого параметра в URL незачем.
        /// </summary>
        public string Resolve(string? requested)
        {
            if (string.IsNullOrWhiteSpace(requested))
            {
                return Base;
            }

            var normalized = requested.Trim().ToUpperInvariant();
            return Supported().Contains(normalized, StringComparer.OrdinalIgnoreCase) ? normalized : Base;
        }
    }
}
