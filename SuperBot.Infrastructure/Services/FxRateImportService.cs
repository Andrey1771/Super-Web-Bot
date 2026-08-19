using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Payments;

namespace SuperBot.Infrastructure.Services
{
    public interface IFxRateImportService
    {
        /// <summary>Забирает курсы у внешнего сервиса и предлагает их книге курсов.</summary>
        Task RunAsync();
    }

    /// <summary>
    /// Суточный импорт курсов.
    ///
    /// Ходит по адресу из конфигурации и отдаёт полученное в <see cref="IFxRateService.OfferAsync"/> —
    /// ту же точку входа, что и админка. Гард на скачок и запись в историю живут там, поэтому
    /// импорту не нужно знать ни про то, ни про другое: его дело — принести числа.
    ///
    /// Провайдер задаётся адресом, а не кодом: формат «объект с картой код→число» одинаков
    /// у open.er-api.com, exchangerate.host и большинства обёрток над ЦБ. Другой ключ карты
    /// настраивается (<c>RatesProperty</c>), совсем другой формат — это отдельная реализация
    /// этого интерфейса, прайсинг она не трогает.
    ///
    /// Ошибка импорта не роняет ничего: прежние курсы остаются в силе. Магазин, торгующий
    /// по вчерашнему курсу, работает; магазин, упавший из-за чужого сервиса, — нет.
    /// </summary>
    public class FxRateImportService : IFxRateImportService
    {
        private readonly HttpClient _http;
        private readonly IFxRateService _rates;
        private readonly StorefrontCurrencyOptions _currencies;
        private readonly FxOptions _fx;
        private readonly ILogger<FxRateImportService> _logger;

        public FxRateImportService(
            HttpClient http,
            IFxRateService rates,
            IOptions<StorefrontCurrencyOptions> currencies,
            IOptionsSnapshot<FxOptions> fx,
            ILogger<FxRateImportService> logger)
        {
            _http = http;
            _rates = rates;
            _currencies = currencies.Value;
            _fx = fx.Value;
            _logger = logger;
        }

        public async Task RunAsync()
        {
            var source = _fx.Source;
            if (string.IsNullOrWhiteSpace(source.Url))
            {
                // Источник не настроен — курсы правит человек через админку. Это рабочий режим,
                // а не ошибка, поэтому молчим.
                return;
            }

            var baseCurrency = _currencies.Base;
            // Просим только те валюты, которыми торгуем: остальные засоряли бы историю.
            var wanted = _currencies.Supported();
            if (wanted.Count <= 1)
            {
                return;
            }

            var url = source.Url.Replace("{base}", baseCurrency, StringComparison.OrdinalIgnoreCase);

            try
            {
                using var response = await _http.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "Сервис курсов ответил {Status}. Оставляем прежние курсы.", (int)response.StatusCode);
                    return;
                }

                var body = await response.Content.ReadAsStringAsync();
                var incoming = FxRatesPayload.Parse(
                    body, baseCurrency, wanted, DateTime.UtcNow, source.RatesProperty);

                if (incoming.Count == 0)
                {
                    _logger.LogWarning("Сервис курсов не вернул ни одной нужной валюты — курсы не менялись.");
                    return;
                }

                var results = await _rates.OfferAsync(incoming);
                var accepted = results.Count(result => result.Accepted);

                _logger.LogInformation(
                    "Импорт курсов: принято {Accepted} из {Total}.", accepted, results.Count);
            }
            catch (Exception exception)
            {
                // Сеть, таймаут, недоступный провайдер — всё это не повод останавливать магазин.
                _logger.LogError(exception, "Импорт курсов не удался. Работаем на прежних курсах.");
            }
        }
    }
}
