using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using SuperBot.Core.Demo;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Ставит метку песочницы на запрос (см. <see cref="DemoSandbox"/>) и следит за правилами демо (<see cref="DemoGuard"/>).
/// Стоит в начале конвейера: всё, что берёт базу после него, уже получает копию посетителя.
/// </summary>
public sealed class DemoSandboxMiddleware(RequestDelegate next, IOptions<DemoOptions> options)
{
    private const string WebhookPath = "/api/payments/webhook";

    /// <summary>Песочница запроса для контроллеров (HttpContext.Items) — чтобы не спрашивать журнал второй раз.</summary>
    public const string ItemKey = "demo-sandbox";

    public async Task InvokeAsync(HttpContext context, DemoSandboxService sandboxes, IMemoryCache cache)
    {
        var demo = options.Value;
        if (!demo.Enabled)
        {
            await next(context);
            return;
        }

        var request = context.Request;
        var cookieId = request.Cookies[demo.CookieName];
        var id = cookieId;
        DemoSandboxInfo? sandbox;
        if (HttpMethods.IsPost(request.Method) && request.Path.Equals(WebhookPath, StringComparison.OrdinalIgnoreCase))
        {
            // Вебхук Stripe приходит без cookie. Песочница — в метаданных платежа, а у возвратов и споров (объекты
            // Charge, Dispute) её ищем по id платежа. Платёж не из живой песочницы (истекла, удалена) принимаем и не
            // обрабатываем: иначе его разбор шёл бы по общему шаблону, а Stripe без ответа 2xx повторял бы его днями.
            var (fromMetadata, paymentIntentId) = await ReadWebhookAsync(request, context.RequestAborted);
            id = fromMetadata ?? (paymentIntentId is null ? null : await sandboxes.FindPaymentSandboxAsync(paymentIntentId, context.RequestAborted));
            sandbox = id is null ? null : await FindCachedAsync(id, sandboxes, cache, context.RequestAborted);
            if (sandbox is null)
            {
                context.Response.StatusCode = StatusCodes.Status200OK;
                await context.Response.WriteAsJsonAsync(new { ignored = "demo: no live sandbox for this payment" });
                return;
            }
            using (DemoSandbox.Enter(sandbox.Id))
            {
                await next(context);
            }
            return;
        }

        sandbox = id is null ? null : await FindCachedAsync(id, sandboxes, cache, context.RequestAborted);
        if (cookieId is not null && sandbox is null)
        {
            // Истекла или удалена: посетитель снова увидит приглашение открыть копию.
            context.Response.Cookies.Delete(demo.CookieName);
        }

        var path = request.Path.Value ?? "/";
        var write = DemoGuard.IsWrite(request.Method);
        if (sandbox is null)
        {
            if (write && DemoGuard.IgnoredWithoutSandbox(path))
            {
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
            if (write && !DemoGuard.AllowedWithoutSandbox(path))
            {
                await RefuseAsync(context, StatusCodes.Status409Conflict, "demo_sandbox_required",
                    "This is a demo. Open your own copy of the shop to make changes.");
                return;
            }
            await next(context);
            return;
        }

        if (write && DemoGuard.ReadOnlyInsideSandbox(request.Method, path))
        {
            await RefuseAsync(context, StatusCodes.Status403Forbidden, "demo_readonly",
                "Disabled in the demo: this would change the site for every visitor, not just your copy.");
            return;
        }

        context.Items[ItemKey] = sandbox;
        using (DemoSandbox.Enter(sandbox.Id))
        {
            await next(context);
        }
    }

    /// <summary>Журнал песочниц спрашивается не на каждый запрос: страница витрины — это десяток запросов.</summary>
    private static async Task<DemoSandboxInfo?> FindCachedAsync(string id, DemoSandboxService sandboxes, IMemoryCache cache, CancellationToken ct)
    {
        if (!DemoSandbox.IsValidId(id))
        {
            return null;
        }
        var key = CacheKey(id);
        if (cache.TryGetValue(key, out DemoSandboxInfo? cached) && cached is not null && cached.ExpiresAt > DateTime.UtcNow)
        {
            return cached;
        }
        var found = await sandboxes.FindAsync(id, ct);
        if (found is not null)
        {
            cache.Set(key, found, TimeSpan.FromSeconds(20));
        }
        return found;
    }

    private static string CacheKey(string id) => "demo-sandbox:" + id;

    /// <summary>
    /// Забыть запомненную запись о песочнице (после «Начать заново» или закрытия). Запись лежит в общем
    /// пространстве кэша, а зовут это изнутри песочницы — поэтому под Suppress.
    /// </summary>
    public static void Forget(IMemoryCache cache, string id)
    {
        using var shared = DemoSandbox.Suppress();
        cache.Remove(CacheKey(id));
    }

    /// <summary>Песочница из метаданных и id платежа: у PaymentIntent это его id, у Charge и Dispute — поле payment_intent.</summary>
    private static async Task<(string? Sandbox, string? PaymentIntentId)> ReadWebhookAsync(HttpRequest request, CancellationToken ct)
    {
        request.EnableBuffering();
        try
        {
            using var doc = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("data", out var data) || !data.TryGetProperty("object", out var obj)
                || obj.ValueKind != JsonValueKind.Object)
            {
                return (null, null);
            }
            static string? Text(JsonElement element, string name) =>
                element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

            var sandbox = obj.TryGetProperty("metadata", out var metadata) && metadata.ValueKind == JsonValueKind.Object
                ? Text(metadata, "sandbox")
                : null;
            var paymentIntentId = Text(obj, "object") == "payment_intent" ? Text(obj, "id") : Text(obj, "payment_intent");
            return (sandbox, paymentIntentId);
        }
        catch (JsonException)
        {
            return (null, null);
        }
        finally
        {
            // Подпись вебхука проверяется по тому же телу — читать его заново с начала.
            request.Body.Position = 0;
        }
    }

    private static Task RefuseAsync(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { code, message });
    }
}
