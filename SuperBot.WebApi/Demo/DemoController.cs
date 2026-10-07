using Microsoft.AspNetCore.Mvc;

using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Demo;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-сайт: открыть свою копию магазина, начать её заново, закрыть, посмотреть письма, которые она «отправила».
/// На обычном магазине (Demo:Enabled = false) отвечает только на /config — «демо выключено».
/// </summary>
[ApiController]
[Route("api/demo")]
public sealed class DemoController(
    IOptions<DemoOptions> options,
    DemoSandboxService sandboxes,
    IMemoryCache cache) : ControllerBase
{
    private DemoOptions Demo => options.Value;

    /// <summary>Что показать посетителю: включено ли демо, есть ли у него копия и до когда, демо-аккаунты.</summary>
    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        if (!Demo.Enabled)
        {
            return Ok(new { enabled = false });
        }
        // Живую копию уже нашло middleware (по cookie, с кэшем) — журнал второй раз не спрашиваем.
        var sandbox = HttpContext.Items[DemoSandboxMiddleware.ItemKey] as DemoSandboxInfo;
        return Ok(new
        {
            enabled = true,
            sandbox = sandbox is null ? null : new { createdAt = sandbox.CreatedAt, expiresAt = sandbox.ExpiresAt },
            sandboxHours = Demo.SandboxHours,
            accounts = Demo.Accounts.Select(a => new { role = a.Role, username = a.Username, password = a.Password }),
        });
    }

    [HttpPost("sandbox")]
    public async Task<IActionResult> Create(CancellationToken ct)
    {
        if (!Demo.Enabled)
        {
            return NotFound();
        }
        // Уже есть живая копия — её и возвращаем: вторая вкладка не должна плодить песочницы.
        if (CurrentId() is { } existingId && await sandboxes.FindAsync(existingId, ct) is { } existing)
        {
            return Ok(Describe(existing));
        }

        var (sandbox, refusal) = await sandboxes.CreateAsync(HttpContext.Connection.RemoteIpAddress?.ToString(), ct);
        if (sandbox is null)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, refusal == DemoSandboxRefusal.Full
                ? new { code = "demo_full", message = "All demo copies are taken right now. Please try again in a while." }
                : new { code = "demo_ip_limit", message = "You have opened several demo copies today. Please continue in the one you have." });
        }
        SetCookie(sandbox);
        return Ok(Describe(sandbox));
    }

    [HttpPost("sandbox/reset")]
    public async Task<IActionResult> Reset(CancellationToken ct)
    {
        if (!Demo.Enabled || CurrentId() is not { } id)
        {
            return NotFound();
        }
        var sandbox = await sandboxes.ResetAsync(id, ct);
        if (sandbox is null)
        {
            return NotFound();
        }
        DemoSandboxMiddleware.Forget(cache, id);
        SetCookie(sandbox);
        return Ok(Describe(sandbox));
    }

    [HttpDelete("sandbox")]
    public async Task<IActionResult> Close(CancellationToken ct)
    {
        if (!Demo.Enabled || CurrentId() is not { } id)
        {
            return NoContent();
        }
        await sandboxes.DeleteAsync(id, ct);
        DemoSandboxMiddleware.Forget(cache, id);
        Response.Cookies.Delete(Demo.CookieName);
        return NoContent();
    }

    /// <summary>«Демо-почта»: письма, которые сайт отправил бы из этой копии (ключи, подтверждения, кэшбэк).</summary>
    [HttpGet("mailbox")]
    public async Task<IActionResult> Mailbox([FromServices] IMongoDatabase database, CancellationToken ct)
    {
        if (!Demo.Enabled || DemoSandbox.CurrentId is null)
        {
            return Ok(Array.Empty<object>());
        }
        var messages = await database.GetCollection<BsonDocument>(DemoSandboxService.MailboxCollection)
            .Find(FilterDefinition<BsonDocument>.Empty)
            .SortByDescending(m => m["sentAt"])
            .Limit(50)
            .ToListAsync(ct);
        return Ok(messages.Select(m => new
        {
            id = m["_id"].ToString(),
            to = m["to"].AsString,
            subject = m["subject"].AsString,
            text = m["text"].AsString,
            html = m.TryGetValue("html", out var html) && html.IsString ? html.AsString : null,
            sentAt = m["sentAt"].ToUniversalTime(),
        }));
    }

    /// <summary>Id из cookie — middleware уже проверило его и поставило метку, если копия жива.</summary>
    private string? CurrentId()
    {
        var id = DemoSandbox.CurrentId ?? Request.Cookies[Demo.CookieName];
        return DemoSandbox.IsValidId(id) ? id : null;
    }

    private void SetCookie(DemoSandboxInfo sandbox) =>
        Response.Cookies.Append(Demo.CookieName, sandbox.Id, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Expires = sandbox.ExpiresAt,
            IsEssential = true,
        });

    private static object Describe(DemoSandboxInfo sandbox) => new { createdAt = sandbox.CreatedAt, expiresAt = sandbox.ExpiresAt };
}
