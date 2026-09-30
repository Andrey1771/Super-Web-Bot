namespace SuperBot.WebApi.Services;

/// <summary>
/// Адрес покупателя для лимитов частоты, антиспама и предварительного налога. Один источник вместо
/// копий в контроллерах, которые доверяли первому адресу из X-Forwarded-For или CF-Connecting-IP:
/// оба заголовка клиент присылает сам, и лимиты обходились подменой.
///
/// X-Real-IP выставляет наш nginx (proxy_set_header перезаписывает значение клиента), а прямой
/// порт бэкенда опубликован только на 127.0.0.1. Если перед nginx появится Cloudflare, реальный
/// адрес нужно восстанавливать в самом nginx (real_ip_header CF-Connecting-IP + set_real_ip_from
/// с диапазонами Cloudflare) — тогда и X-Real-IP станет верным, а код менять не придётся.
/// </summary>
public static class ClientAddress
{
    public static string? Resolve(HttpContext context)
    {
        var realIp = context.Request.Headers["X-Real-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(realIp))
        {
            return realIp.Trim();
        }
        return context.Connection.RemoteIpAddress?.ToString();
    }

    /// <summary>Для ключей кэша и лимитов, где нужен непустой ключ.</summary>
    public static string ResolveOrUnknown(HttpContext context) => Resolve(context) ?? "unknown";
}
