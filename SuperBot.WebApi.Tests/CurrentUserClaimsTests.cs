using System.Security.Claims;
using SuperBot.Common.Auth;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Идентификатор пользователя из токена. JwtBearer маппит «sub» в NameIdentifier, и в ClaimsPrincipal
/// голого «sub» нет — помощник обязан находить его под обоими именами. Раньше три контроллера искали
/// только «sub» и отвечали 401 живому пользователю.
/// </summary>
public class CurrentUserClaimsTests
{
    private static ClaimsPrincipal Principal(params Claim[] claims) => new(new ClaimsIdentity(claims, "test"));

    [Fact]
    public void Finds_the_id_under_the_mapped_claim_name_as_real_tokens_arrive()
    {
        var user = Principal(new Claim(ClaimTypes.NameIdentifier, "kc-sub-1"), new Claim("email", "a@b.c"));
        Assert.Equal("kc-sub-1", user.GetUserId());
    }

    [Fact]
    public void Still_accepts_a_raw_sub_and_the_legacy_userId_claim()
    {
        Assert.Equal("raw-sub", Principal(new Claim("sub", "raw-sub")).GetUserId());
        Assert.Equal("legacy", Principal(new Claim("userId", "legacy")).GetUserId());
    }

    [Fact]
    public void Is_empty_for_an_anonymous_principal()
    {
        Assert.Equal(string.Empty, new ClaimsPrincipal(new ClaimsIdentity()).GetUserId());
        Assert.Equal(string.Empty, ((ClaimsPrincipal?)null).GetUserId());
    }
}
