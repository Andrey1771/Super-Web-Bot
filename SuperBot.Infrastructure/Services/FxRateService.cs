using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;

namespace SuperBot.Infrastructure.Services
{
    public interface IFxRateService
    {
        /// <summary>Актуальные курсы от базовой валюты каталога.</summary>
        FxRateBook Current();

        /// <summary>
        /// Предлагает новые курсы. Каждый проходит гард: слишком большой скачок не применяется,
        /// прежний курс остаётся в силе. Принятые сохраняются новым снимком. Возвращает решения
        /// по каждой валюте — для алерта.
        /// </summary>
        Task<IReadOnlyList<FxRateBook.RateUpdate>> OfferAsync(IEnumerable<FxRate> incoming);
    }

    /// <summary>
    /// Курсы валют магазина.
    ///
    /// Держит книгу курсов в памяти процесса: курс читается на каждый запрос каталога, а меняется
    /// раз в сутки — ходить за ним в базу на каждую карточку незачем. База нужна для другого:
    /// пережить перезапуск и сохранить историю, по которой потом разбирают спорные заказы.
    ///
    /// Источник курсов намеренно отделён. Сегодня это значения из конфигурации, которые правит
    /// человек; завтра — импорт из внешнего сервиса. Точка входа одна — <see cref="OfferAsync"/>,
    /// и гард в ней уже стоит, каким бы ни был источник.
    /// </summary>
    public class FxRateService : IFxRateService
    {
        private readonly StorefrontCurrencyOptions _currencies;
        private readonly FxOptions _fx;
        private readonly IServiceScopeFactory? _scopeFactory;
        private readonly ILogger<FxRateService> _logger;
        private readonly object _gate = new();
        private FxRateBook _book;
        private bool _loadedFromStorage;

        public FxRateService(
            IOptions<StorefrontCurrencyOptions> currencies,
            IOptions<FxOptions> fx,
            ILogger<FxRateService> logger,
            // Репозиторий живёт в области запроса, а сервис — синглтон: берём его через фабрику
            // областей. Без хранилища (в тестах) сервис работает на курсах из конфигурации.
            IServiceScopeFactory? scopeFactory = null)
        {
            _currencies = currencies.Value;
            _fx = fx.Value;
            _logger = logger;
            _scopeFactory = scopeFactory;
            _book = BuildFromConfiguration();
        }

        public FxRateBook Current()
        {
            EnsureLoadedFromStorage();

            lock (_gate)
            {
                return _book;
            }
        }

        public async Task<IReadOnlyList<FxRateBook.RateUpdate>> OfferAsync(IEnumerable<FxRate> incoming)
        {
            EnsureLoadedFromStorage();

            var results = new List<FxRateBook.RateUpdate>();
            var accepted = new List<FxRate>();

            lock (_gate)
            {
                foreach (var rate in incoming)
                {
                    var result = _book.Offer(rate, _fx.MaxChangePercent);
                    results.Add(result);

                    if (result.Accepted)
                    {
                        accepted.Add(result.Rate);
                    }
                    else
                    {
                        // Не ошибка обработки: магазин продолжает торговать по прежнему курсу,
                        // а разбираться идёт человек — поэтому предупреждение, а не исключение.
                        _logger.LogWarning("Курс отклонён гардом: {Reason}", result.Reason);
                    }
                }
            }

            // В историю попадает только то, что прошло гард: иначе она перестала бы быть
            // ответом на вопрос «по какому курсу считали».
            if (accepted.Count > 0 && _scopeFactory is not null)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var repository = scope.ServiceProvider.GetRequiredService<IFxRateRepository>();
                    await repository.AddAsync(accepted);
                }
                catch (Exception exception)
                {
                    // Курсы уже применены в памяти — магазин работает. Потеря снимка неприятна,
                    // но ронять из-за неё импорт нельзя.
                    _logger.LogError(exception, "Не удалось сохранить снимок курсов.");
                }
            }

            return results;
        }

        /// <summary>
        /// Подтягивает последние курсы из базы один раз за жизнь процесса. Ленивая загрузка,
        /// а не работа в конструкторе: синглтон создаётся при старте приложения, когда база
        /// может быть ещё недоступна, и падать из-за этого целиком неправильно.
        /// </summary>
        private void EnsureLoadedFromStorage()
        {
            if (_loadedFromStorage || _scopeFactory is null)
            {
                return;
            }

            lock (_gate)
            {
                if (_loadedFromStorage)
                {
                    return;
                }

                _loadedFromStorage = true;

                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var repository = scope.ServiceProvider.GetRequiredService<IFxRateRepository>();
                    var stored = repository.GetLatestAsync(_currencies.Base).GetAwaiter().GetResult();

                    if (stored.Count > 0)
                    {
                        // База важнее конфигурации: там лежит последний принятый курс, а в
                        // конфигурации — значение, с которого магазин когда-то стартовал.
                        _book = new FxRateBook(_currencies.Base, stored);
                        _logger.LogInformation("Курсы валют загружены из базы: {Count}.", stored.Count);
                    }
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(exception, "Курсы из базы недоступны — работаем по конфигурации.");
                }
            }
        }

        private FxRateBook BuildFromConfiguration()
        {
            var now = DateTime.UtcNow;
            var rates = _fx.ManualRates
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Key) && pair.Value > 0)
                .Select(pair => new FxRate(_currencies.Base, pair.Key.Trim().ToUpperInvariant(), pair.Value, now))
                .ToList();

            if (rates.Count > 0)
            {
                _logger.LogInformation("Курсы валют взяты из конфигурации: {Count}.", rates.Count);
            }

            return new FxRateBook(_currencies.Base, rates);
        }
    }
}
