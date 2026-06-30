using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/account/security")]
    [Authorize]
    public class AccountSecurityController : ControllerBase
    {
        private readonly KeycloakAdminClient _keycloakAdminClient;
        private readonly IConfiguration _configuration;

        public AccountSecurityController(KeycloakAdminClient keycloakAdminClient, IConfiguration configuration)
        {
            _keycloakAdminClient = keycloakAdminClient;
            _configuration = configuration;
        }

        [HttpGet("status")]
        public async Task<ActionResult<AccountSecurityStatusResponse>> GetStatus()
        {
            var userId = GetUserId();
            var user = await _keycloakAdminClient.GetUserAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            var credentials = await _keycloakAdminClient.GetUserCredentialsAsync(userId);
            var sessions = await _keycloakAdminClient.GetUserSessionsAsync(userId);

            return Ok(new AccountSecurityStatusResponse
            {
                Email = user.Email,
                EmailVerified = user.EmailVerified,
                TwoFactorEnabled = credentials.Any(cred => cred.Type.Equals("otp", StringComparison.OrdinalIgnoreCase)),
                BackupCodesGenerated = false,
                PasswordUpdatedAt = null,
                AccountConsoleUrl = BuildAccountConsoleUrl(),
                Sessions = sessions.Select(session => new AccountSessionResponse
                {
                    Id = session.Id,
                    IpAddress = session.IpAddress,
                    Start = session.Start,
                    LastAccess = session.LastAccess,
                    Device = BuildDeviceLabel(session)
                }).ToList()
            });
        }

        [HttpPost("email/resend")]
        public async Task<IActionResult> ResendEmailVerification()
        {
            var userId = GetUserId();
            var user = await _keycloakAdminClient.GetUserAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            if (user.EmailVerified)
            {
                return NoContent();
            }

            await _keycloakAdminClient.SendVerifyEmailAsync(userId);
            return Ok();
        }

        [HttpPost("email/change")]
        public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest request)
        {
            var userId = GetUserId();
            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            await _keycloakAdminClient.UpdateEmailAsync(userId, request.NewEmail, false);
            await _keycloakAdminClient.ExecuteActionsEmailAsync(
                userId,
                new[] { "VERIFY_EMAIL" },
                BuildRedirectUri(),
                _configuration["Keycloak:Admin:PublicClientId"]
            );
            return Ok();
        }

        [HttpPost("2fa/setup")]
        public async Task<ActionResult<SecurityActionResponse>> SetupTwoFactor()
        {
            var userId = GetUserId();
            await _keycloakAdminClient.ExecuteActionsEmailAsync(
                userId,
                new[] { "CONFIGURE_TOTP" },
                BuildRedirectUri(),
                _configuration["Keycloak:Admin:PublicClientId"]
            );

            return Ok(new SecurityActionResponse
            {
                Mode = "email",
                Message = "We sent an email to finish setting up 2FA.",
                RedirectUrl = BuildAccountConsoleUrl()
            });
        }

        [HttpPost("2fa/disable")]
        public async Task<IActionResult> DisableTwoFactor()
        {
            var userId = GetUserId();
            var credentials = await _keycloakAdminClient.GetUserCredentialsAsync(userId);
            var otpCredentials = credentials
                .Where(cred => cred.Type.Equals("otp", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(cred.Id))
                .ToList();

            foreach (var credential in otpCredentials)
            {
                await _keycloakAdminClient.DeleteCredentialAsync(userId, credential.Id);
            }

            return Ok(new { disabled = true, removed = otpCredentials.Count });
        }

        [HttpPost("password/change")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var userId = GetUserId();
            if (!await ValidatePasswordAsync(request.CurrentPassword))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            await _keycloakAdminClient.ResetPasswordAsync(userId, request.NewPassword, false);
            await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
            return Ok(new SecurityActionResponse
            {
                Mode = "logout",
                Message = "Password updated. Please sign in again."
            });
        }

        [HttpPost("password/reset-email")]
        public async Task<IActionResult> SendResetPasswordEmail()
        {
            var userId = GetUserId();
            await _keycloakAdminClient.ExecuteActionsEmailAsync(
                userId,
                new[] { "UPDATE_PASSWORD" },
                BuildRedirectUri(),
                _configuration["Keycloak:Admin:PublicClientId"]
            );
            return Ok();
        }

        [HttpDelete("sessions/{sessionId}")]
        public async Task<IActionResult> LogoutSession(string sessionId)
        {
            await _keycloakAdminClient.LogoutSessionAsync(sessionId);
            return Ok();
        }

        [HttpPost("sessions/logout-all")]
        public async Task<IActionResult> LogoutAllSessions()
        {
            var userId = GetUserId();
            await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
            return Ok();
        }

        [HttpPost("report")]
        public async Task<IActionResult> DownloadReport()
        {
            var userId = GetUserId();
            var user = await _keycloakAdminClient.GetUserAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            var credentials = await _keycloakAdminClient.GetUserCredentialsAsync(userId);
            var sessions = await _keycloakAdminClient.GetUserSessionsAsync(userId);
            var report = new
            {
                user.Email,
                user.EmailVerified,
                TwoFactorEnabled = credentials.Any(cred => cred.Type.Equals("otp", StringComparison.OrdinalIgnoreCase)),
                SessionsCount = sessions.Count,
                GeneratedAt = DateTime.UtcNow
            };

            var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(report, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            return File(bytes, "application/json", "security-report.json");
        }

        [HttpPost("delete-account")]
        public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest request)
        {
            var userId = GetUserId();
            if (!string.Equals(request.Confirmation, "DELETE", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Type DELETE to confirm." });
            }
            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            await _keycloakAdminClient.DisableUserAsync(userId);
            await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
            return Ok();
        }

        private string GetUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? User.FindFirstValue("sub")
                   ?? string.Empty;
        }

        private async Task<bool> ValidatePasswordAsync(string password)
        {
            var username = User.FindFirstValue("preferred_username") ?? User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(username))
            {
                return false;
            }
            return await _keycloakAdminClient.ValidatePasswordAsync(username, password);
        }

        private string BuildRedirectUri()
        {
            return _configuration["Keycloak:Admin:SecurityRedirectUri"] ?? string.Empty;
        }

        private string BuildAccountConsoleUrl()
        {
            var baseUrl = _configuration["Keycloak:Admin:AccountConsoleUrl"];
            if (!string.IsNullOrWhiteSpace(baseUrl))
            {
                return baseUrl;
            }

            var realm = _configuration["Keycloak:Admin:Realm"];
            var authBase = _configuration["Keycloak:Admin:BaseUrl"];
            return $"{authBase?.TrimEnd('/')}/realms/{realm}/account";
        }

        private static string BuildDeviceLabel(KeycloakSession session)
        {
            // Keycloak admin sessions API не отдаёт browser/OS, поэтому даём аккуратный
            // нейтральный лейбл вместо "Unknown browser on Unknown OS".
            if (!string.IsNullOrWhiteSpace(session.Browser) && !string.IsNullOrWhiteSpace(session.Os))
            {
                return $"{session.Browser} on {session.Os}";
            }
            if (!string.IsNullOrWhiteSpace(session.Browser))
            {
                return session.Browser!;
            }
            return "Active web session";
        }
    }

    public class AccountSecurityStatusResponse
    {
        public string Email { get; set; } = string.Empty;
        public bool EmailVerified { get; set; }
        public bool TwoFactorEnabled { get; set; }
        public bool BackupCodesGenerated { get; set; }
        public DateTime? PasswordUpdatedAt { get; set; }
        public string AccountConsoleUrl { get; set; } = string.Empty;
        public List<AccountSessionResponse> Sessions { get; set; } = new();
    }

    public class AccountSessionResponse
    {
        public string Id { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long Start { get; set; }
        public long LastAccess { get; set; }
        public string Device { get; set; } = string.Empty;
    }

    public class ChangeEmailRequest
    {
        public string NewEmail { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class DeleteAccountRequest
    {
        public string Confirmation { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class SecurityActionResponse
    {
        public string Mode { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? RedirectUrl { get; set; }
    }
}
