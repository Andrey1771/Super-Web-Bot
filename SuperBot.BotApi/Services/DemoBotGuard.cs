using System.Security.Claims;

namespace SuperBot.BotApi.Services;

/// <summary>
/// Демо-сайт для портфолио (Demo:Enabled): бот общий для всех посетителей. Только просмотр — то, что меняет бота
/// для всех или стоит денег: рассылка ушла бы реальным подписчикам, вебхук и тексты — общие, а счёт в Telegram Stars
/// из мини-приложения — настоящие деньги. Привязать свой Telegram посетитель может: аккаунты у посетителей свои,
/// и уведомления о заказах придут ему же. Нельзя только общему демо-админу — иначе уведомления с публичной учётки
/// получал бы тот, кто её привязал. Ответ тот же, что у сайта (code demo_readonly), — витрина объясняет его сама.
/// </summary>
public static class DemoBotGuard
{
    private static readonly string[] ReadOnlyPrefixes =
    [
        "/api/admin/bot",
        "/api/miniapp",
    ];

    /// <summary>Своё у каждого посетителя — закрыто только общему демо-админу.</summary>
    private static readonly string[] ViewerReadOnlyPrefixes =
    [
        "/api/account/telegram",
    ];

    private static bool IsWrite(HttpRequest request) =>
        !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method));

    private static bool Matches(HttpRequest request, string[] prefixes) =>
        prefixes.Any(prefix => request.Path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

    /// <summary>Вошёл общий демо-админ: учётка с ролью admin из Demo:Accounts (тот же список, что у сайта).</summary>
    public static bool IsViewer(ClaimsPrincipal user, IConfiguration configuration)
    {
        if (user.Identity?.IsAuthenticated != true)
        {
            return false;
        }
        var name = user.FindFirstValue("preferred_username");
        return name is not null && configuration.GetSection("Demo:Accounts").GetChildren().Any(account =>
            string.Equals(account["Role"], "admin", StringComparison.OrdinalIgnoreCase)
            && string.Equals(account["Username"], name, StringComparison.OrdinalIgnoreCase));
    }

    public static bool IsReadOnly(HttpRequest request, ClaimsPrincipal user, IConfiguration configuration) =>
        IsWrite(request)
        && (Matches(request, ReadOnlyPrefixes)
            || (Matches(request, ViewerReadOnlyPrefixes) && IsViewer(user, configuration)));

    public static IApplicationBuilder UseDemoBotGuard(this IApplicationBuilder app, IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>("Demo:Enabled"))
        {
            return app;
        }
        return app.Use(async (context, next) =>
        {
            if (IsReadOnly(context.Request, context.User, configuration))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    code = "demo_readonly",
                    message = "Disabled in the demo: this would change the shared bot or charge real Telegram Stars.",
                });
                return;
            }
            await next(context);
        });
    }
}
