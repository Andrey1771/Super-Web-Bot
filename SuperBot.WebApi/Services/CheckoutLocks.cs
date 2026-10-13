namespace SuperBot.WebApi.Services;

/// <summary>
/// Очередь создания платежа для одного покупателя.
///
/// Касса шлёт create-payment-intent на каждое изменение (корзина, промокод, переключатель кэшбэка), и запросы одного
/// покупателя приходят внахлёст. Создание платежа — несколько шагов: найти прежнее намерение, отложить кэшбэк, создать
/// или обновить намерение в Stripe, записать его. Второй запрос, пришедший до того, как первый записал намерение, не
/// находил, что переиспользовать, открывал новую ссылку резерва и видел баланс уже отложенным первым — отвечал
/// «кэшбэк 0». На экране это мигало: вычет → 0 → вычет. Поэтому запросы одного покупателя выполняются по очереди.
///
/// Замков фиксированное число: ключ (id покупателя или почта гостя) хешируется в одну из <see cref="Stripes"/> полос.
/// Словарь «замок на каждого покупателя» рос бы без предела — касса открыта без входа, и любой набор случайных почт
/// оставлял бы в памяти процесса по семафору навсегда. Соседство двух разных покупателей в одной полосе безвредно:
/// они лишь дождутся друг друга, а полос достаточно, чтобы это было редкостью.
///
/// Замок в памяти процесса: backend один. Если их станет несколько, нужна распределённая блокировка (Mongo/Redis).
/// </summary>
public static class CheckoutLocks
{
    /// <summary>Сколько полос: степень двойки, чтобы хеш ложился ровно.</summary>
    public const int Stripes = 1024;

    /// <summary>Дольше не ждём: зависший запрос не должен навсегда блокировать кассу покупателя.</summary>
    public static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(30);

    private static readonly SemaphoreSlim[] Gates = Enumerable.Range(0, Stripes).Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    /// <summary>
    /// Встать в очередь покупателя; освобождение — Dispose. Не дождались за <see cref="MaxWait"/> — отказ, а не проход
    /// без замка: пропущенный без очереди запрос возвращал бы ровно то мигание кэшбэка, от которого замок защищает.
    /// </summary>
    public static async Task<IDisposable> AcquireAsync(string userKey, CancellationToken cancellationToken = default)
    {
        var gate = Gates[StripeOf(userKey)];
        if (!await gate.WaitAsync(MaxWait, cancellationToken))
        {
            throw new TimeoutException("Another checkout request for this customer is still running.");
        }
        return new Releaser(gate);
    }

    /// <summary>Номер полосы для ключа. Хеш — свой, детерминированный: string.GetHashCode в .NET меняется от запуска к запуску.</summary>
    public static int StripeOf(string userKey)
    {
        var hash = 2166136261u;
        foreach (var symbol in (userKey ?? string.Empty).ToUpperInvariant())
        {
            hash = (hash ^ symbol) * 16777619u;
        }
        return (int)(hash & (Stripes - 1));
    }

    private sealed class Releaser : IDisposable
    {
        private SemaphoreSlim? _gate;

        public Releaser(SemaphoreSlim gate) => _gate = gate;

        public void Dispose() => Interlocked.Exchange(ref _gate, null)?.Release();
    }
}
