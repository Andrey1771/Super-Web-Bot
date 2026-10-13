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
        /// <param name="bypassGuard">Снять гард на скачок. Только для ручного ввода в админке: человек видит
        /// процент изменения и подтверждает его сознательно; для автоматического импорта гард всегда включён.</param>
        Task<IReadOnlyList<FxRateBook.RateUpdate>> OfferAsync(IEnumerable<FxRate> incoming, bool bypassGuard = false);
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
        // Монитор: наценку и гард владелец меняет из админки; сервис — синглтон, снимок бы застыл на старте.
        private readonly IOptionsMonitor<FxOptions> _fxMonitor;
        private FxOptions _fx => _fxMonitor.CurrentValue;
        private readonly IServiceScopeFactory? _scopeFactory;
        private readonly ILogger<FxRateService> _logger;
        private readonly object _gate = new();
        private FxRateBook _book;
        private DateTime _loadedAtUtc = DateTime.MinValue;

        /// <summary>
        /// Как долго книга курсов живёт в памяти процесса, прежде чем перечитаться из базы.
        ///
        /// Раньше загрузка была ровно одна за жизнь процесса, и на одном инстансе это работало.
        /// На двух — нет: суточный импорт запускается планировщиком на ОДНОМ инстансе, обновляет
        /// свою память и базу, а остальные продолжают отдавать вчерашние курсы до перезапуска.
        /// Это цены в каталоге: покупатель видел бы разную цену в зависимости от того, на какой
        /// инстанс его отправил балансировщик.
        ///
        /// Минута выбрана как компромисс: курс меняется раз в сутки, значит расхождение между
        /// инстансами ограничено минутой, а базу мы тревожим одним маленьким чтением в минуту
        /// на инстанс — а не на каждую карточку товара.
        /// </summary>
        private TimeSpan RefreshInterval => TimeSpan.FromSeconds(Math.Max(0, _fx.MemoryRefreshSeconds));

        public FxRateService(
            IOptions<StorefrontCurrencyOptions> currencies,
            IOptionsMonitor<FxOptions> fx,
            ILogger<FxRateService> logger,
            // Репозиторий живёт в области запроса, а сервис — синглтон: берём его через фабрику
            // областей. Без хранилища (в тестах) сервис работает на курсах из конфигурации.
            IServiceScopeFactory? scopeFactory = null)
        {
            _currencies = currencies.Value;
            _fxMonitor = fx;
            _logger = logger;
            _scopeFactory = scopeFactory;
            _book = BuildFromConfiguration();
        }

        public FxRateBook Current()
        {
            EnsureFresh();

            lock (_gate)
            {
                return _book;
            }
        }

        public async Task<IReadOnlyList<FxRateBook.RateUpdate>> OfferAsync(IEnumerable<FxRate> incoming, bool bypassGuard = false)
        {
            EnsureFresh();

            var maxChange = bypassGuard ? decimal.MaxValue : _fx.MaxChangePercent;
            var results = new List<FxRateBook.RateUpdate>();
            var accepted = new List<FxRate>();

            lock (_gate)
            {
                foreach (var rate in incoming)
                {
                    var result = _book.Offer(rate, maxChange);
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
        /// Подтягивает последние курсы из базы, если прошло больше <see cref="RefreshInterval"/>.
        ///
        /// Ленивая загрузка, а не работа в конструкторе: синглтон создаётся при старте
        /// приложения, когда база может быть ещё недоступна, и падать из-за этого целиком
        /// неправильно. Повторное чтение — ради нескольких инстансов: импорт идёт на одном,
        /// а торгуют по этим курсам все.
        /// </summary>
        private void EnsureFresh()
        {
            var interval = RefreshInterval;
            if (_scopeFactory is null || (interval > TimeSpan.Zero && DateTime.UtcNow - _loadedAtUtc < interval))
            {
                return;
            }

            lock (_gate)
            {
                if (interval > TimeSpan.Zero && DateTime.UtcNow - _loadedAtUtc < interval)
                {
                    return;
                }

                // Отметку ставим ДО чтения: если база недоступна, следующая попытка будет
                // через минуту, а не на каждый запрос каталога.
                _loadedAtUtc = DateTime.UtcNow;

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
