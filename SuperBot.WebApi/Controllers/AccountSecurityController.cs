using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/account/security")]
    [Authorize]
    public class AccountSecurityController : ControllerBase
    {
        private readonly KeycloakAdminClient _keycloakAdminClient;
        private readonly KeycloakAdminOptions _keycloakOptions;
        private readonly ILogger<AccountSecurityController> _logger;

        public AccountSecurityController(
            KeycloakAdminClient keycloakAdminClient,
            IOptions<KeycloakAdminOptions> keycloakOptions,
            ILogger<AccountSecurityController> logger)
        {
            _keycloakAdminClient = keycloakAdminClient;
            _keycloakOptions = keycloakOptions.Value;
            _logger = logger;
        }

        [HttpGet("status")]
        public async Task<ActionResult<AccountSecurityStatusResponse>> GetStatus()
        {
            var userId = GetUserId();
            var fallbackEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            var status = CreateUnavailableStatus(fallbackEmail);

            if (!_keycloakAdminClient.IsConfiguredForSecurity)
            {
                return Ok(status);
            }

            try
            {
                var user = await _keycloakAdminClient.GetUserAsync(userId);
                if (user == null)
                {
                    return NotFound();
                }

                var credentials = await _keycloakAdminClient.GetUserCredentialsAsync(userId);
                var sessions = await _keycloakAdminClient.GetUserSessionsAsync(userId);
                var hasOtp = credentials.Any(cred => cred.Type.Equals("otp", StringComparison.OrdinalIgnoreCase));

                return Ok(new AccountSecurityStatusResponse
                {
                    Email = user.Email,
                    EmailVerified = user.EmailVerified,
                    TwoFactorEnabled = hasOtp,
                    BackupCodesGenerated = null,
                    PasswordUpdatedAt = null,
                    KeycloakAdminConfigured = true,
                    AccountConsoleUrl = BuildAccountConsoleUrl(),
                    UnavailableReasons = new Dictionary<string, string>
                    {
                        ["backupCodes"] = "Backup codes are managed in Keycloak account console.",
                        ["passwordUpdatedAt"] = "Last password change date is not available from Keycloak."
                    },
                    Capabilities = BuildCapabilities(isConfigured: true),
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
            catch (KeycloakAdminApiException ex)
            {
                _logger.LogWarning(ex, "Unable to load security status from Keycloak for user {UserId}.", userId);
                status.UnavailableReasons["keycloak"] = ex.Message;
                return Ok(status);
            }
        }

        [HttpPost("email/resend")]
        public async Task<IActionResult> ResendEmailVerification()
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();

            try
            {
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
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("email/change")]
        public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest request)
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            try
            {
                await _keycloakAdminClient.UpdateEmailAsync(userId, request.NewEmail, false);
                await _keycloakAdminClient.ExecuteActionsEmailAsync(
                    userId,
                    new[] { "VERIFY_EMAIL" },
                    BuildRedirectUri(),
                    BuildPublicClientId()
                );

                return Ok(new SecurityActionResponse
                {
                    Mode = "email",
                    Message = "Email updated. Please verify your new address from the confirmation email."
                });
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("2fa/setup")]
        public async Task<ActionResult<SecurityActionResponse>> SetupTwoFactor()
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            try
            {
                await _keycloakAdminClient.ExecuteActionsEmailAsync(
                    userId,
                    new[] { "CONFIGURE_TOTP" },
                    BuildRedirectUri(),
                    BuildPublicClientId()
                );

                return Ok(new SecurityActionResponse
                {
                    Mode = "email",
                    Message = "We sent you an email with instructions to complete 2FA setup in Keycloak.",
                    RedirectUrl = BuildAccountConsoleUrl()
                });
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("password/change")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            if (!await ValidatePasswordAsync(request.CurrentPassword))
            {
                return BadRequest(new { message = "Invalid current password." });
            }

            try
            {
                await _keycloakAdminClient.ResetPasswordAsync(userId, request.NewPassword, false);
                await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
                return Ok(new SecurityActionResponse
                {
                    Mode = "logout",
                    Message = "Password updated. Please sign in again."
                });
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("password/reset-email")]
        public async Task<IActionResult> SendResetPasswordEmail()
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            try
            {
                await _keycloakAdminClient.ExecuteActionsEmailAsync(
                    userId,
                    new[] { "UPDATE_PASSWORD" },
                    BuildRedirectUri(),
                    BuildPublicClientId()
                );
                return Ok(new SecurityActionResponse
                {
                    Mode = "email",
                    Message = "Password reset instructions were sent to your email."
                });
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpDelete("sessions/{sessionId}")]
        public async Task<IActionResult> LogoutSession(string sessionId)
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();

            try
            {
                var sessions = await _keycloakAdminClient.GetUserSessionsAsync(userId);
                var targetSession = sessions.FirstOrDefault(session => session.Id == sessionId);
                if (targetSession == null)
                {
                    return NotFound(new { message = "Session not found." });
                }

                await _keycloakAdminClient.LogoutSessionAsync(sessionId);
                return Ok();
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("sessions/logout-all")]
        public async Task<IActionResult> LogoutAllSessions()
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            try
            {
                await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
                return Ok();
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("report")]
        public async Task<IActionResult> DownloadReport()
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            try
            {
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
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        [HttpPost("deactivate-account")]
        public async Task<IActionResult> DeactivateAccount([FromBody] DeactivateAccountRequest request)
        {
            var misconfiguredResult = CreateMisconfiguredProblemResult();
            if (misconfiguredResult != null)
            {
                return misconfiguredResult;
            }

            var userId = GetUserId();
            if (!string.Equals(request.Confirmation, "DEACTIVATE", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Type DEACTIVATE to confirm." });
            }
            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            try
            {
                await _keycloakAdminClient.DisableUserAsync(userId);
                await _keycloakAdminClient.LogoutAllSessionsAsync(userId);
                return Ok(new SecurityActionResponse
                {
                    Mode = "logout",
                    Message = "Account deactivated. Contact support if you need reactivation."
                });
            }
            catch (Exception ex)
            {
                return HandleSecurityException(ex);
            }
        }

        private string GetUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? User.FindFirstValue("sub")
                   ?? string.Empty;
        }

        private async Task<bool> ValidatePasswordAsync(string password)
        {
            if (!_keycloakAdminClient.IsConfiguredForSecurity)
            {
                return false;
            }

            var username = User.FindFirstValue("preferred_username") ?? User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(username))
            {
                return false;
            }
            return await _keycloakAdminClient.ValidatePasswordAsync(username, password);
        }

        private string BuildRedirectUri()
        {
            return _keycloakOptions.SecurityRedirectUri ?? string.Empty;
        }

        private string BuildPublicClientId()
        {
            if (!string.IsNullOrWhiteSpace(_keycloakOptions.PublicClientId))
            {
                return _keycloakOptions.PublicClientId;
            }

            return _keycloakOptions.ClientId;
        }

        private string BuildAccountConsoleUrl()
        {
            var baseUrl = _keycloakOptions.AccountConsoleUrl;
            if (!string.IsNullOrWhiteSpace(baseUrl))
            {
                return baseUrl;
            }

            var realm = _keycloakOptions.Realm;
            var authBase = _keycloakOptions.BaseUrl;
            return $"{authBase?.TrimEnd('/')}/realms/{realm}/account";
        }

        private AccountSecurityStatusResponse CreateUnavailableStatus(string email)
        {
            var configured = _keycloakAdminClient.IsConfiguredForSecurity;
            var reasons = new Dictionary<string, string>
            {
                ["backupCodes"] = "Backup codes are managed in Keycloak account console.",
                ["passwordUpdatedAt"] = "Last password change date is not available from Keycloak."
            };

            if (!configured)
            {
                reasons["configuration"] = _keycloakAdminClient.ConfigurationError ?? "Keycloak admin integration is unavailable.";
            }

            return new AccountSecurityStatusResponse
            {
                Email = email,
                EmailVerified = false,
                TwoFactorEnabled = false,
                BackupCodesGenerated = null,
                PasswordUpdatedAt = null,
                KeycloakAdminConfigured = configured,
                AccountConsoleUrl = configured ? BuildAccountConsoleUrl() : null,
                Capabilities = BuildCapabilities(configured),
                UnavailableReasons = reasons,
                Sessions = new List<AccountSessionResponse>()
            };
        }

        private AccountSecurityCapabilitiesResponse BuildCapabilities(bool isConfigured)
        {
            return new AccountSecurityCapabilitiesResponse
            {
                CanManageTwoFactor = isConfigured,
                CanChangePasswordInline = isConfigured,
                CanSendPasswordResetEmail = isConfigured,
                CanManageSessions = isConfigured,
                CanChangeEmail = isConfigured,
                CanResendVerificationEmail = isConfigured,
                CanDownloadSecurityReport = isConfigured,
                CanDeactivateAccount = isConfigured
            };
        }

        private ObjectResult? CreateMisconfiguredProblemResult()
        {
            if (_keycloakAdminClient.IsConfiguredForSecurity)
            {
                return null;
            }

            var detail = _keycloakAdminClient.ConfigurationError ?? "Keycloak admin integration is unavailable.";
            _logger.LogWarning("Security action blocked due to missing Keycloak admin configuration. {Detail}", detail);
            return Problem(
                title: "Security integration is unavailable",
                detail: detail,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        private ObjectResult HandleSecurityException(Exception exception)
        {
            switch (exception)
            {
                case KeycloakAdminConfigurationException configurationException:
                    _logger.LogWarning(configurationException, "Security operation failed due to configuration.");
                    return Problem(
                        title: "Security integration is unavailable",
                        detail: configurationException.Message,
                        statusCode: StatusCodes.Status503ServiceUnavailable);
                case KeycloakAdminApiException apiException:
                    _logger.LogWarning(apiException, "Keycloak admin request failed with status {StatusCode}.", apiException.StatusCode);
                    var mappedStatus = apiException.StatusCode == HttpStatusCode.Unauthorized || apiException.StatusCode == HttpStatusCode.Forbidden
                        ? StatusCodes.Status502BadGateway
                        : (int)apiException.StatusCode;
                    return StatusCode(mappedStatus, new { message = apiException.Message });
                default:
                    _logger.LogError(exception, "Unexpected security operation failure.");
                    return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Security operation failed. Please try again later." });
            }
        }

        private static string BuildDeviceLabel(KeycloakSession session)
        {
            var browser = string.IsNullOrWhiteSpace(session.Browser) ? "Unknown browser" : session.Browser;
            var os = string.IsNullOrWhiteSpace(session.Os) ? "Unknown OS" : session.Os;
            return $"{browser} on {os}";
        }
    }

    public class AccountSecurityStatusResponse
    {
        public string Email { get; set; } = string.Empty;
        public bool EmailVerified { get; set; }
        public bool TwoFactorEnabled { get; set; }
        public bool? BackupCodesGenerated { get; set; }
        public DateTime? PasswordUpdatedAt { get; set; }
        public bool KeycloakAdminConfigured { get; set; }
        public string? AccountConsoleUrl { get; set; }
        public AccountSecurityCapabilitiesResponse Capabilities { get; set; } = new();
        public Dictionary<string, string> UnavailableReasons { get; set; } = new();
        public List<AccountSessionResponse> Sessions { get; set; } = new();
    }

    public class AccountSecurityCapabilitiesResponse
    {
        public bool CanManageTwoFactor { get; set; }
        public bool CanChangePasswordInline { get; set; }
        public bool CanSendPasswordResetEmail { get; set; }
        public bool CanManageSessions { get; set; }
        public bool CanChangeEmail { get; set; }
        public bool CanResendVerificationEmail { get; set; }
        public bool CanDownloadSecurityReport { get; set; }
        public bool CanDeactivateAccount { get; set; }
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

    public class DeactivateAccountRequest
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
