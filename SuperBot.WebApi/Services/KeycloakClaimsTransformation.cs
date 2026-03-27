using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;
using System.Text.Json;

namespace SuperBot.WebApi.Services
{
    public class KeycloakClaimsTransformation : IClaimsTransformation
    {

        public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
        {
            var identity = (ClaimsIdentity)principal.Identity;

            var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var resourceClaim in principal.Claims.Where(c => c.Type == "resource_access"))
            {
                using var document = JsonDocument.Parse(resourceClaim.Value);
                foreach (var resource in document.RootElement.EnumerateObject())
                {
                    if (resource.Value.TryGetProperty("roles", out var rolesArray))
                    {
                        foreach (var role in rolesArray.EnumerateArray())
                        {
                            if (!string.IsNullOrWhiteSpace(role.GetString()))
                            {
                                roles.Add(role.GetString()!);
                            }
                        }
                    }
                }
            }

            var realmAccessClaim = principal.Claims.FirstOrDefault(c => c.Type == "realm_access");
            if (realmAccessClaim != null)
            {
                using var document = JsonDocument.Parse(realmAccessClaim.Value);
                if (document.RootElement.TryGetProperty("roles", out var rolesArray))
                {
                    foreach (var role in rolesArray.EnumerateArray())
                    {
                        if (!string.IsNullOrWhiteSpace(role.GetString()))
                        {
                            roles.Add(role.GetString()!);
                        }
                    }
                }
            }

            foreach (var role in roles)
            {
                if (!identity.HasClaim(ClaimTypes.Role, role))
                {
                    identity.AddClaim(new Claim(ClaimTypes.Role, role));
                }
            }

            return Task.FromResult(principal);
        }
    }
}
