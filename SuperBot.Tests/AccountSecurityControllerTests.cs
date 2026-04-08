using System.Net;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services;

namespace SuperBot.Tests;

public class AccountSecurityControllerTests
{
    [Fact]
    public async Task GetStatus_ReturnsCapabilitiesAndNoFakeFields()
    {
        var handler = new StubHttpMessageHandler((request) =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/protocol/openid-connect/token"))
            {
                return Json(HttpStatusCode.OK, new { access_token = "token", expires_in = 3600 });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1") && request.Method == HttpMethod.Get)
            {
                return Json(HttpStatusCode.OK, new { id = "user-1", email = "user@mail.com", emailVerified = true });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1/credentials"))
            {
                return Json(HttpStatusCode.OK, new[] { new { type = "otp" } });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1/sessions"))
            {
                return Json(HttpStatusCode.OK, new[] { new { id = "s1", ipAddress = "127.0.0.1", start = 1710000000, lastAccess = 1710000300, browser = "Chrome", os = "Windows" } });
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var controller = CreateController(handler, new KeycloakAdminOptions
        {
            BaseUrl = "http://localhost:8088",
            Realm = "realm",
            ClientId = "admin-client",
            ClientSecret = "secret",
            PublicClientId = "public",
            AccountConsoleUrl = "http://localhost:8088/realms/realm/account"
        });

        var result = await controller.GetStatus();
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsType<AccountSecurityStatusResponse>(ok.Value);

        Assert.True(payload.KeycloakAdminConfigured);
        Assert.True(payload.Capabilities.CanManageTwoFactor);
        Assert.True(payload.Capabilities.CanResendVerificationEmail);
        Assert.True(payload.Capabilities.CanDownloadSecurityReport);
        Assert.True(payload.TwoFactorEnabled);
        Assert.Null(payload.BackupCodesGenerated);
        Assert.Null(payload.PasswordUpdatedAt);
        Assert.Single(payload.Sessions);
    }

    [Fact]
    public async Task LogoutSession_ReturnsNotFound_WhenSessionDoesNotBelongToUser()
    {
        var deleteInvoked = false;
        var handler = new StubHttpMessageHandler((request) =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/protocol/openid-connect/token"))
            {
                return Json(HttpStatusCode.OK, new { access_token = "token", expires_in = 3600 });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1/sessions") && request.Method == HttpMethod.Get)
            {
                return Json(HttpStatusCode.OK, new[] { new { id = "owned-session", ipAddress = "127.0.0.1", start = 1710000000, lastAccess = 1710000300 } });
            }

            if (request.RequestUri!.AbsolutePath.Contains("/admin/realms/realm/sessions/") && request.Method == HttpMethod.Delete)
            {
                deleteInvoked = true;
            }

            return new HttpResponseMessage(HttpStatusCode.NoContent);
        });

        var controller = CreateController(handler, ValidOptions());

        var result = await controller.LogoutSession("foreign-session");

        Assert.IsType<NotFoundObjectResult>(result);
        Assert.False(deleteInvoked);
    }

    [Fact]
    public async Task DeactivateAccount_ValidatesAndDisablesUser()
    {
        var disableInvoked = false;
        var logoutInvoked = false;

        var handler = new StubHttpMessageHandler((request) =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/protocol/openid-connect/token"))
            {
                if (request.Content != null)
                {
                    var body = request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (body.Contains("grant_type=password"))
                    {
                        return Json(HttpStatusCode.OK, new { access_token = "password-token", expires_in = 3600 });
                    }
                }

                return Json(HttpStatusCode.OK, new { access_token = "admin-token", expires_in = 3600 });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1") && request.Method == HttpMethod.Put)
            {
                disableInvoked = true;
                return new HttpResponseMessage(HttpStatusCode.NoContent);
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1/logout") && request.Method == HttpMethod.Post)
            {
                logoutInvoked = true;
                return new HttpResponseMessage(HttpStatusCode.NoContent);
            }

            return new HttpResponseMessage(HttpStatusCode.NoContent);
        });

        var controller = CreateController(handler, ValidOptions());
        var result = await controller.DeactivateAccount(new DeactivateAccountRequest
        {
            Confirmation = "DEACTIVATE",
            Password = "valid-password"
        });

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<SecurityActionResponse>(ok.Value);
        Assert.Equal("logout", response.Mode);
        Assert.True(disableInvoked);
        Assert.True(logoutInvoked);
    }

    [Fact]
    public async Task SecurityActions_Return503_WhenAdminIntegrationMisconfigured()
    {
        var controller = CreateController(new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)), new KeycloakAdminOptions
        {
            BaseUrl = "http://localhost:8088",
            Realm = "realm",
            ClientId = "admin-client",
            ClientSecret = ""
        });

        var result = await controller.ResendEmailVerification();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objectResult.StatusCode);
    }

    [Fact]
    public async Task ResendEmailVerification_Returns503_WhenKeycloakReturnsForbidden()
    {
        var handler = new StubHttpMessageHandler((request) =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/protocol/openid-connect/token"))
            {
                return Json(HttpStatusCode.OK, new { access_token = "token", expires_in = 3600 });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/users/user-1") && request.Method == HttpMethod.Get)
            {
                return Json(HttpStatusCode.OK, new { id = "user-1", email = "user@mail.com", emailVerified = false });
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/send-verify-email") && request.Method == HttpMethod.Put)
            {
                return Json(HttpStatusCode.Forbidden, new { error = "forbidden", error_description = "insufficient_scope" });
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var controller = CreateController(handler, ValidOptions());

        var result = await controller.ResendEmailVerification();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objectResult.StatusCode);
    }

    private static AccountSecurityController CreateController(HttpMessageHandler handler, KeycloakAdminOptions options)
    {
        var client = new KeycloakAdminClient(
            new HttpClient(handler),
            Options.Create(options),
            NullLogger<KeycloakAdminClient>.Instance);

        var controller = new AccountSecurityController(
            client,
            Options.Create(options),
            NullLogger<AccountSecurityController>.Instance);

        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("sub", "user-1"),
            new Claim("preferred_username", "user-1"),
            new Claim(ClaimTypes.Email, "user@mail.com")
        }, "Test"));

        controller.ControllerContext = new ControllerContext { HttpContext = context };
        return controller;
    }

    private static KeycloakAdminOptions ValidOptions() => new()
    {
        BaseUrl = "http://localhost:8088",
        Realm = "realm",
        ClientId = "admin-client",
        ClientSecret = "secret",
        PublicClientId = "public",
        SecurityRedirectUri = "http://localhost:3000/account/security",
        AccountConsoleUrl = "http://localhost:8088/realms/realm/account"
    };

    private static HttpResponseMessage Json(HttpStatusCode statusCode, object payload)
    {
        return new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
