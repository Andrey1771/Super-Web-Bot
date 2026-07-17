using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Тестовая аутентификация вместо Keycloak JWT: личность собирается из заголовков запроса.
///   X-Test-Email — email пользователя (без заголовка запрос анонимный),
///   X-Test-Sub   — идентификатор пользователя (Keycloak sub),
///   X-Test-Roles — роли через запятую (например "admin").
/// </summary>
public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Test";

    public const string EmailHeader = "X-Test-Email";
    public const string SubHeader = "X-Test-Sub";
    public const string RolesHeader = "X-Test-Roles";

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var email = Request.Headers[EmailHeader].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(email))
        {
            return Task.FromResult(AuthenticateResult.NoResult()); // анонимный запрос
        }

        var claims = new List<Claim>
        {
            new("email", email),
            new(ClaimTypes.Email, email),
            new("sub", Request.Headers[SubHeader].FirstOrDefault() ?? $"test-user-{email}"),
            new(ClaimTypes.NameIdentifier, Request.Headers[SubHeader].FirstOrDefault() ?? $"test-user-{email}"),
            new(ClaimTypes.Name, email),
        };

        var roles = Request.Headers[RolesHeader].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(roles))
        {
            foreach (var role in roles.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }
        }

        var identity = new ClaimsIdentity(claims, SchemeName);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
