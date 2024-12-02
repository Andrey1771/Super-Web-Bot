using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;

namespace SuperBot.WebApi.Services
{
    public class KeycloakClaimsTransformation : IClaimsTransformation
    {
        public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
        {
            var identity = (ClaimsIdentity)principal.Identity;

            var resourceAccessClaims = principal.Claims
                .Where(c => c.Type == "resource_access")
                .Select(c => System.Text.Json.JsonDocument.Parse(c.Value))
                .ToList();

            var roles = new List<string>();

            foreach (var resource in resourceAccessClaims)
            {
                if (resource.RootElement.TryGetProperty("tale-shop-app", out var appRoles) &&
                    appRoles.TryGetProperty("roles", out var rolesArray))
                {
                    roles.AddRange(rolesArray.EnumerateArray().Select(role => role.GetString()));
                }
            }

            foreach (var role in roles)
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, role));
            }

            return Task.FromResult(principal);
        }
    }
}
