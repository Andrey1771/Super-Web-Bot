namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-сайт для портфолио (секция Demo, env Demo__*). Включается на отдельной установке: у каждого посетителя
/// своя копия базы-шаблона на сутки (песочница), письма складываются в «демо-почту», а действия, которые
/// изменили бы сайт для всех (общие демо-аккаунты Keycloak, настройки сайта, файлы медиа), — только просмотр.
/// На обычном магазине выключено и ни на что не влияет.
/// </summary>
public sealed class DemoOptions
{
    public const string SectionName = "Demo";

    public bool Enabled { get; set; }

    /// <summary>Имя базы песочницы — этот префикс + id. Mongo ограничивает имя базы 64 байтами.</summary>
    public string SandboxDatabasePrefix { get; set; } = "tsdemo_";

    /// <summary>Сколько живёт песочница.</summary>
    public int SandboxHours { get; set; } = 24;

    /// <summary>Сколько песочниц может жить одновременно: каждая — копия базы, сервер у демо маленький.</summary>
    public int MaxSandboxes { get; set; } = 20;

    /// <summary>
    /// Сколько готовых копий держать про запас. Копия шаблона собирается секунды (индексы — операции над базой),
    /// а посетитель получает запасную сразу; новая собирается в фоне. 0 — собирать по запросу.
    /// </summary>
    public int SpareSandboxes { get; set; } = 2;

    /// <summary>Через сколько дней невыданная запасная копия пересобирается (шаблон мог обновиться).</summary>
    public int SpareMaxAgeDays { get; set; } = 7;

    /// <summary>Сколько новых песочниц можно открыть с одного адреса за сутки.</summary>
    public int MaxSandboxesPerIpPerDay { get; set; } = 3;

    public string CookieName { get; set; } = "ts_demo";

    /// <summary>
    /// Демо-аккаунты, которые показываются на странице входа в демо. Пароли публичные намеренно: это общие
    /// учётки демо, сменить их из песочницы нельзя (см. <see cref="DemoGuard"/>).
    /// </summary>
    public List<DemoAccount> Accounts { get; set; } = [];
}

public sealed class DemoAccount
{
    /// <summary>admin или buyer — какую роль показывает карточка.</summary>
    public string Role { get; set; } = "buyer";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}
