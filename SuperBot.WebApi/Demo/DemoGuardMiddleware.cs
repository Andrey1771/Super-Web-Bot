using System.Text;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-админ — «только просмотр» (<see cref="DemoGuard"/>): пишущие запросы получают 403 demo_readonly, а в ответах
/// ему почты посетителей замаскированы, IP и устройства — скрыты. Стоит после входа: роль известна только по токену.
/// Остальных не касается.
/// </summary>
public sealed class DemoGuardMiddleware(RequestDelegate next, IOptions<DemoOptions> options)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var demo = options.Value;
        var request = context.Request;
        if (!demo.Enabled
            || !request.Path.StartsWithSegments("/api")
            || !DemoGuard.IsViewer(context.User, demo))
        {
            await next(context);
            return;
        }

        var path = request.Path.Value ?? "/";
        if (!DemoGuard.ViewerMaySend(request.Method, path))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new
            {
                code = "demo_readonly",
                message = "Demo: the admin account is view-only. Create your own account to buy and test the store."
            }, context.RequestAborted);
            return;
        }

        // Ответ собираем в памяти, чтобы замаскировать почты. Потоковые ответы (чат поддержки) не трогаем.
        if (!DemoGuard.IsWrite(request.Method))
        {
            await MaskResponseAsync(context);
            return;
        }
        await next(context);
    }

    private async Task MaskResponseAsync(HttpContext context)
    {
        var original = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next(context);
        }
        finally
        {
            context.Response.Body = original;
        }

        buffer.Position = 0;
        var type = context.Response.ContentType ?? "";
        if (!type.Contains("json", StringComparison.OrdinalIgnoreCase) && !type.StartsWith("text/", StringComparison.OrdinalIgnoreCase))
        {
            await buffer.CopyToAsync(original, context.RequestAborted);
            return;
        }

        var text = await new StreamReader(buffer, Encoding.UTF8).ReadToEndAsync(context.RequestAborted);
        text = DemoGuard.MaskEmails(text, options.Value.OwnEmailDomains);
        if (DemoGuard.CarriesClientInfo(context.Request.Path.Value ?? "/"))
        {
            text = DemoGuard.MaskClientInfo(text);
        }
        var bytes = Encoding.UTF8.GetBytes(text);
        context.Response.ContentLength = bytes.Length;
        await original.WriteAsync(bytes, context.RequestAborted);
    }
}
