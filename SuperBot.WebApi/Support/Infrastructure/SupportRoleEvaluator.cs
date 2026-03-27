using Microsoft.Extensions.Options;
using System.Security.Claims;

namespace SuperBot.WebApi.Support.Infrastructure;

public class SupportRoleEvaluator
{
    private readonly SupportRoleOptions _options;

    public SupportRoleEvaluator(IOptions<SupportRoleOptions> options)
    {
        _options = options.Value;
    }

    public bool IsSupportAgent(ClaimsPrincipal user)
    {
        return _options.Roles.Any(user.IsInRole);
    }
}
