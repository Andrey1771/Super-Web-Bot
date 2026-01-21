using System.Security.Claims;

namespace SuperBot.WebApi.Support.Infrastructure;

public class SupportUserContext
{
    public string UserId { get; }
    public string Email { get; }
    public string DisplayName { get; }

    public SupportUserContext(string userId, string email, string displayName)
    {
        UserId = userId;
        Email = email;
        DisplayName = displayName;
    }

    public static SupportUserContext FromClaims(ClaimsPrincipal user)
    {
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? string.Empty;
        var email = user.FindFirstValue(ClaimTypes.Email) ?? user.FindFirstValue("email") ?? string.Empty;
        var name = user.FindFirstValue("preferred_username")
            ?? user.FindFirstValue(ClaimTypes.Name)
            ?? user.FindFirstValue("name")
            ?? email
            ?? "User";

        return new SupportUserContext(userId, email, name);
    }
}
