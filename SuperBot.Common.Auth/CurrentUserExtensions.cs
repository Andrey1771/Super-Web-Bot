using System.Security.Claims;

namespace SuperBot.Common.Auth
{
    /// <summary>
    /// Единый способ определить «кто это» во всём приложении.
    ///
    /// Зачем отдельный хелпер: цепочка клеймов была скопирована в десяток контроллеров,
    /// и платёжный путь отличался — он брал sub, а всё остальное (кабинет, вишлист, блог) email.
    /// В результате ключ выдавался на один идентификатор, а страница «Keys &amp; activation»
    /// искала по другому, и купленный ключ не показывался.
    ///
    /// Порядок намеренно совпадает с исторически сложившимся в проекте (email первым),
    /// чтобы уже сохранённые данные (ключи, вишлисты, заказы) продолжали находиться.
    /// </summary>
    public static class CurrentUserExtensions
    {
        public static string GetUserKey(this ClaimsPrincipal? user)
        {
            return user?.FindFirst("email")?.Value
                ?? user?.FindFirst(ClaimTypes.Email)?.Value
                ?? user?.FindFirst("preferred_username")?.Value
                ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user?.FindFirst("sub")?.Value
                ?? string.Empty;
        }
    }
}
