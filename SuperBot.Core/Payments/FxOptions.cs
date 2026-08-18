namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Настройки пересчёта по курсу. Секция конфигурации — <c>Storefront:Fx</c>.
    ///
    /// Курсы здесь не хранятся: они живут в базе со снимками и историей. В конфигурации только
    /// правила, по которым сырой курс превращается в ценник.
    /// </summary>
    public class FxOptions
    {
        /// <summary>
        /// Надбавка к пересчитанной цене, в процентах. Покрывает движение курса между показом
        /// и списанием плюс комиссию провайдера за конверсию. Разумный диапазон — 2–5 %.
        /// </summary>
        public decimal MarkupPercent { get; set; } = 3m;

        /// <summary>
        /// Насколько курс может измениться за один импорт, в процентах. Больше — не применяем
        /// и оставляем прежний: скачок обычно означает сбой источника, а не движение рынка,
        /// а автоматически применённый сбой уводит цены всего каталога на порядок.
        /// </summary>
        public decimal MaxChangePercent { get; set; } = 10m;

        /// <summary>
        /// Правило округления по валютам: код → <see cref="PriceRoundingRule"/>.
        /// Валюта без правила округляется до своей точности вверх.
        /// </summary>
        public Dictionary<string, string> Rounding { get; set; } = new();

        /// <summary>
        /// Курсы, заданные руками: код валюты → сколько её единиц даёт единица базовой.
        /// Простейший источник, которого достаточно, пока курсы правит человек. Автоматический
        /// импорт подключается отдельной реализацией источника и эти значения замещает.
        /// </summary>
        public Dictionary<string, decimal> ManualRates { get; set; } = new();

        /// <summary>Откуда брать курсы автоматически. Пустой адрес — источника нет, курсы правит человек.</summary>
        public FxSourceOptions Source { get; set; } = new();

        /// <summary>Правило округления для валюты.</summary>
        public PriceRoundingRule RuleFor(string currency)
        {
            foreach (var (code, rule) in Rounding)
            {
                if (string.Equals(code?.Trim(), currency, StringComparison.OrdinalIgnoreCase) &&
                    Enum.TryParse<PriceRoundingRule>(rule, ignoreCase: true, out var parsed))
                {
                    return parsed;
                }
            }

            return PriceRoundingRule.None;
        }
    }

    /// <summary>
    /// Внешний сервис курсов. Провайдер задаётся адресом, а не кодом: формат «объект с картой
    /// код валюты → число» одинаков у большинства бесплатных сервисов, различается только ключ
    /// карты и путь. Ключ настраивается здесь же, совсем другой формат — отдельная реализация
    /// импорта, прайсинг она не трогает.
    /// </summary>
    public class FxSourceOptions
    {
        /// <summary>
        /// Адрес запроса. Подстановка <c>{base}</c> заменяется базовой валютой каталога.
        /// Пример без ключа и регистрации: <c>https://open.er-api.com/v6/latest/{base}</c>.
        /// Пусто — автоматического импорта нет, курсы правит человек через админку.
        /// </summary>
        public string Url { get; set; } = string.Empty;

        /// <summary>Свойство ответа с картой курсов. У большинства сервисов — <c>rates</c>.</summary>
        public string RatesProperty { get; set; } = "rates";
    }
}
