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
        /// <summary>
        /// Идентификатор пользователя из токена (sub в Keycloak). JwtBearer по умолчанию маппит входящие
        /// клеймы: «sub» приходит в приложение как <see cref="ClaimTypes.NameIdentifier"/>, а самого «sub»
        /// в ClaimsPrincipal нет. Контроллеры, искавшие голый «sub», отвечали 401 живому пользователю с
        /// валидным токеном — тесты этого не видели, потому что тестовый обработчик подставлял оба клейма.
        /// </summary>
        public static string GetUserId(this ClaimsPrincipal? user)
        {
            return user?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user?.FindFirst("sub")?.Value
                ?? user?.FindFirst("userId")?.Value
                ?? string.Empty;
        }

        /// <summary>
        /// Все имена, под которыми могли быть записаны заказы этого человека: email, логин Keycloak
        /// (preferred_username), имя из токена и sub. Заказ пишется по email из платежа, а
        /// <c>User.Identity.Name</c> с настоящим токеном — это «name» (отображаемое имя): поиск по
        /// одному имени не находил купленное, и форма отзыва не появлялась у покупателя.
        /// </summary>
        public static IReadOnlyCollection<string> GetOrderOwnerAliases(this ClaimsPrincipal? user)
        {
            var aliases = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void Add(string? value)
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    aliases.Add(value.Trim());
                }
            }
            Add(user?.FindFirst("email")?.Value);
            Add(user?.FindFirst(ClaimTypes.Email)?.Value);
            Add(user?.FindFirst("preferred_username")?.Value);
            Add(user?.Identity?.Name);
            Add(user?.FindFirst(ClaimTypes.Name)?.Value);
            Add(user?.FindFirst("name")?.Value);
            Add(user?.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            Add(user?.FindFirst("sub")?.Value);
            return aliases;
        }

        /// <summary>Почта из токена.</summary>
        public static string GetEmail(this ClaimsPrincipal? user) =>
            user?.FindFirst("email")?.Value ?? user?.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty;

        /// <summary>Имя для документов покупателя: отображаемое имя, логин или почта.</summary>
        public static string GetDisplayName(this ClaimsPrincipal? user) =>
            user?.FindFirst("name")?.Value ?? user?.FindFirst("preferred_username")?.Value ?? user.GetEmail();

        /// <summary>
        /// Ключи, под которыми лежат платёжные и личные данные аккаунта: sub, почта и логин. Уже, чем
        /// <see cref="GetOrderOwnerAliases"/>: отображаемое имя сюда не входит, оно не уникально.
        /// </summary>
        public static HashSet<string> GetAccountIdentifiers(this ClaimsPrincipal? user)
        {
            var identifiers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var value in new[] { user.GetUserId(), user.GetEmail(), user?.FindFirst("preferred_username")?.Value })
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    identifiers.Add(value);
                }
            }
            return identifiers;
        }

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
