namespace SuperBot.WebApi.Demo;

/// <summary>
/// Что в демо можно, а что нет. Правила — по адресам, чтобы весь список был виден в одном месте.
/// </summary>
public static class DemoGuard
{
    /// <summary>
    /// Без песочницы посетитель смотрит шаблон, а менять его нельзя: изменения увидели бы все. Пишущие запросы
    /// пропускаются только сюда — открыть песочницу и служебные проверки. Вебхук Stripe middleware ведёт отдельно:
    /// он всегда обрабатывается в песочнице своего платежа.
    /// </summary>
    private static readonly string[] WritableWithoutSandbox =
    [
        "/api/demo/",
        "/api/health",
    ];

    /// <summary>
    /// Фоновые счётчики, которые витрина шлёт сама, без действия посетителя: просмотр игры, воронка, трейлер,
    /// чтение новости. Без песочницы их принимаем и молча выбрасываем (204): иначе каждый такой отказ открывал бы
    /// приглашение «откройте свою копию» на каждой странице, а записи засоряли бы общий шаблон.
    /// </summary>
    private static readonly (string Path, bool Exact)[] SilentWithoutSandbox =
    [
        ("/api/tracking/", false),
        ("/api/blog/events", true),
    ];

    public static bool IgnoredWithoutSandbox(string path) =>
        SilentWithoutSandbox.Any(rule => rule.Exact
            ? string.Equals(path.TrimEnd('/'), rule.Path, StringComparison.OrdinalIgnoreCase)
            : path.StartsWith(rule.Path, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// В песочнице — только просмотр: эти действия меняют общее для всех посетителей, а не копию базы.
    /// Демо-аккаунты Keycloak общие (пароль, почта, 2FA, сессии, блокировка, имя и аватар); настройки сайта,
    /// аналитики и курсов живут в памяти всего приложения; медиа, варианты обложек и импорт из Steam —
    /// общие файлы; рассылку отправляет фоновый процесс шаблона.
    /// </summary>
    private static readonly (string Method, string Prefix)[] ReadOnlyInSandbox =
    [
        ("*", "/api/account/security/"),
        ("PATCH", "/api/account/profile"),
        ("DELETE", "/api/account/avatar"),
        ("*", "/api/admin/customers/"),
        ("*", "/api/account-recovery/admin/"),
        ("*", "/api/admin/site-settings"),
        ("*", "/api/admin/analytics"),
        ("*", "/api/admin/fx-rates"),
        ("*", "/api/admin/steam-import"),
        ("*", "/api/admin/data-tools"),
        ("*", "/api/admin/newsletter"),
        ("PUT", "/api/images/meta"),
        ("DELETE", "/api/media/"),
        ("POST", "/api/media/thumbnails/backfill"),
    ];

    public static bool IsWrite(string method) =>
        !(HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method));

    public static bool AllowedWithoutSandbox(string path) =>
        !path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
        || WritableWithoutSandbox.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));

    public static bool ReadOnlyInsideSandbox(string method, string path) =>
        ReadOnlyInSandbox.Any(rule =>
            (rule.Method == "*" || string.Equals(rule.Method, method, StringComparison.OrdinalIgnoreCase))
            && path.StartsWith(rule.Prefix, StringComparison.OrdinalIgnoreCase));
}
