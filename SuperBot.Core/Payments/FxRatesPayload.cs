using System.Text.Json;

namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Разбор ответа сервиса курсов.
    ///
    /// Вынесено из HTTP-клиента отдельно и без зависимостей: разбор чужого JSON — самое
    /// хрупкое место интеграции, и проверять его надо строкой в тесте, а не походом в сеть.
    ///
    /// Формат намеренно самый распространённый: объект с картой «код валюты → число» под
    /// известным ключом (<c>rates</c> у open.er-api.com, exchangerate.host, ЦБ-подобных обёрток).
    /// Провайдер с другим форматом меняется реализацией источника, а не правкой прайсинга.
    /// </summary>
    public static class FxRatesPayload
    {
        /// <summary>
        /// Достаёт курсы из ответа. Берём только валюты из <paramref name="wanted"/>: чужой список
        /// на полторы сотни валют не нужен, а лишние записи засоряли бы историю.
        /// Нечисловые и неположительные значения отбрасываются — до гарда они дойти не должны.
        /// </summary>
        public static IReadOnlyList<FxRate> Parse(
            string json,
            string baseCurrency,
            IReadOnlyCollection<string> wanted,
            DateTime capturedAtUtc,
            string ratesProperty = "rates")
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return Array.Empty<FxRate>();
            }

            try
            {
                using var document = JsonDocument.Parse(json);
                if (!document.RootElement.TryGetProperty(ratesProperty, out var rates) ||
                    rates.ValueKind != JsonValueKind.Object)
                {
                    return Array.Empty<FxRate>();
                }

                var result = new List<FxRate>();
                foreach (var currency in wanted)
                {
                    if (string.IsNullOrWhiteSpace(currency))
                    {
                        continue;
                    }

                    var code = currency.Trim().ToUpperInvariant();
                    if (string.Equals(code, baseCurrency, StringComparison.OrdinalIgnoreCase))
                    {
                        // Курс валюты к самой себе — единица, хранить его незачем.
                        continue;
                    }

                    if (!rates.TryGetProperty(code, out var value))
                    {
                        continue;
                    }

                    if (value.ValueKind != JsonValueKind.Number || !value.TryGetDecimal(out var rate) || rate <= 0)
                    {
                        continue;
                    }

                    result.Add(new FxRate(baseCurrency, code, rate, capturedAtUtc));
                }

                return result;
            }
            catch (JsonException)
            {
                // Сервис вернул не JSON (заглушка провайдера, страница ошибки, обрезанный ответ).
                // Это не повод падать: прежние курсы остаются в силе.
                return Array.Empty<FxRate>();
            }
        }
    }
}
