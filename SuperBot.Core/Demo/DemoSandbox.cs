namespace SuperBot.Core.Demo;

/// <summary>
/// Песочница демо-сайта, к которой относится текущая работа: запрос посетителя, письмо после его покупки,
/// вебхук Stripe по его заказу. У каждого посетителя демо — своя копия базы на сутки, и всё, что зависит
/// от базы (сама база, кэш в памяти), выбирается по этой метке.
///
/// Метка живёт в AsyncLocal: её ставит middleware в начале запроса, и она сама доезжает до всего, что
/// запрос вызывает, включая await. Долгоживущие сервисы, которые держат общие для всех данные (настройки
/// сайта, курсы), читают базу под <see cref="Suppress"/> — иначе их обновление, случайно выпавшее на
/// запрос из песочницы, разнесло бы её данные по всему сайту.
/// </summary>
public static class DemoSandbox
{
    private static readonly AsyncLocal<string?> Current = new();

    /// <summary>
    /// Id песочницы текущей работы; null — общий сайт (шаблон демо или обычный магазин). «Начать заново» выдаёт
    /// новую копию с новым id, поэтому id годится и как пространство кэша в памяти.
    /// </summary>
    public static string? CurrentId => Current.Value;

    /// <summary>Длина id: 128 бит случайности в hex. Id — это ключ доступа к копии, угадать его нельзя.</summary>
    public const int IdLength = 32;

    public static bool IsValidId(string? id) =>
        id is { Length: IdLength } && id.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');

    public static string NewId() => Guid.NewGuid().ToString("N");

    /// <summary>Работа внутри песочницы (или вне всех, если id = null) до Dispose; прежняя метка возвращается.</summary>
    public static IDisposable Enter(string? id)
    {
        if (id is not null && !IsValidId(id))
        {
            throw new ArgumentException("Invalid sandbox id.", nameof(id));
        }
        var previous = Current.Value;
        Current.Value = id;
        return new Restore(previous);
    }

    /// <summary>Работа с общими данными сайта, даже если вызвана из запроса песочницы.</summary>
    public static IDisposable Suppress() => Enter(null);

    private sealed class Restore(string? previous) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            Current.Value = previous;
        }
    }
}
