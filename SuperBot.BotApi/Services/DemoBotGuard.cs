namespace SuperBot.BotApi.Services;

/// <summary>
/// Демо-сайт для портфолио (Demo:Enabled): бот общий для всех посетителей, песочниц у него нет. Всё, что меняет
/// бота или выходит за пределы демо, — только просмотр: рассылка ушла бы реальным подписчикам бота, вебхук и
/// тексты — общие, привязка Telegram к общему демо-аккаунту слала бы уведомления тому, кто привязал, а счёт в
/// Telegram Stars из мини-приложения — это настоящие деньги. Ответ тот же, что у сайта (code demo_readonly), —
/// витрина объясняет его посетителю сама.
/// </summary>
public static class DemoBotGuard
{
    private static readonly string[] ReadOnlyPrefixes =
    [
        "/api/admin/bot",
        "/api/account/telegram",
        "/api/miniapp",
    ];

    public static bool IsReadOnly(HttpRequest request) =>
        !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method))
        && ReadOnlyPrefixes.Any(prefix => request.Path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

    public static IApplicationBuilder UseDemoBotGuard(this IApplicationBuilder app, IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>("Demo:Enabled"))
        {
            return app;
        }
        return app.Use(async (context, next) =>
        {
            if (IsReadOnly(context.Request))
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
