using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OtpNet;
using QRCoder;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/account")]
    [Authorize]
    public class AccountSecurityController : ControllerBase
    {
        private readonly IAccountSecurityProfileRepository _securityProfileRepository;
        private readonly IAccountSessionRepository _sessionRepository;
        private readonly KeycloakAccountService _keycloakAccountService;

        public AccountSecurityController(
            IAccountSecurityProfileRepository securityProfileRepository,
            IAccountSessionRepository sessionRepository,
            KeycloakAccountService keycloakAccountService)
        {
            _securityProfileRepository = securityProfileRepository;
            _sessionRepository = sessionRepository;
            _keycloakAccountService = keycloakAccountService;
        }

        [HttpGet("me")]
        public async Task<ActionResult<AccountSecurityResponse>> GetAccount()
        {
            var (userId, email, emailVerified, displayName) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);
            await TouchSessionAsync(userId);

            return Ok(new AccountSecurityResponse
            {
                DisplayName = displayName ?? email,
                Email = profile.Email,
                EmailVerified = emailVerified,
                MemberSince = profile.MemberSince,
                IsTwoFactorEnabled = profile.IsTwoFactorEnabled,
                LastPasswordChangeAt = profile.LastPasswordChangeAt,
                BackupCodesGeneratedAt = profile.BackupCodesGeneratedAt,
                HasBackupCodes = profile.BackupCodesHash.Count > 0
            });
        }

        [HttpPost("email/resend-verification")]
        public async Task<IActionResult> ResendVerification()
        {
            var accessToken = GetAccessToken();
            await _keycloakAccountService.SendVerificationEmailAsync(accessToken);
            return Ok();
        }

        [HttpPost("email/change")]
        public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailRequest request)
        {
            var (userId, _, emailVerified, _) = GetUserIdentity();
            var accessToken = GetAccessToken();

            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            await _keycloakAccountService.UpdateEmailAsync(accessToken, request.NewEmail);
            await _keycloakAccountService.SendVerificationEmailAsync(accessToken);

            var profile = await GetOrCreateProfileAsync(userId, request.NewEmail, emailVerified);
            profile.Email = request.NewEmail;
            profile.EmailVerified = false;
            await _securityProfileRepository.UpsertAsync(profile);

            return Ok();
        }

        [HttpPost("password/change")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var accessToken = GetAccessToken();
            await _keycloakAccountService.ChangePasswordAsync(accessToken, request.CurrentPassword, request.NewPassword);

            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);
            profile.LastPasswordChangeAt = DateTime.UtcNow;
            await _securityProfileRepository.UpsertAsync(profile);

            return Ok();
        }

        [HttpGet("2fa/setup")]
        public async Task<ActionResult<TwoFactorSetupResponse>> SetupTwoFactor()
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);
            if (string.IsNullOrWhiteSpace(profile.TwoFactorSecret))
            {
                profile.TwoFactorSecret = Base32Encoding.ToString(KeyGeneration.GenerateRandomKey(20));
                await _securityProfileRepository.UpsertAsync(profile);
            }

            var otpauthUri = $"otpauth://totp/Tale%20Shop:{Uri.EscapeDataString(email)}?secret={profile.TwoFactorSecret}&issuer=Tale%20Shop";
            var qrCode = GenerateQrCode(otpauthUri);

            return Ok(new TwoFactorSetupResponse
            {
                OtpauthUri = otpauthUri,
                QrPngBase64 = qrCode,
                ManualKey = profile.TwoFactorSecret
            });
        }

        [HttpPost("2fa/enable")]
        public async Task<ActionResult<TwoFactorEnableResponse>> EnableTwoFactor([FromBody] TwoFactorVerifyRequest request)
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);

            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            if (string.IsNullOrWhiteSpace(profile.TwoFactorSecret))
            {
                return BadRequest(new { message = "Two-factor secret is missing." });
            }

            if (!ValidateTotp(profile.TwoFactorSecret, request.Code))
            {
                return BadRequest(new { message = "Invalid authentication code." });
            }

            var backupCodes = GenerateBackupCodes();
            profile.IsTwoFactorEnabled = true;
            profile.BackupCodesHash = backupCodes.Select(HashBackupCode).ToList();
            profile.BackupCodesGeneratedAt = DateTime.UtcNow;
            await _securityProfileRepository.UpsertAsync(profile);

            return Ok(new TwoFactorEnableResponse { BackupCodes = backupCodes });
        }

        [HttpPost("2fa/disable")]
        public async Task<IActionResult> DisableTwoFactor([FromBody] TwoFactorVerifyRequest request)
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);

            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            if (!ValidateTotp(profile.TwoFactorSecret, request.Code))
            {
                return BadRequest(new { message = "Invalid authentication code." });
            }

            profile.IsTwoFactorEnabled = false;
            profile.BackupCodesHash.Clear();
            profile.BackupCodesGeneratedAt = null;
            await _securityProfileRepository.UpsertAsync(profile);

            return Ok();
        }

        [HttpPost("2fa/backup/regenerate")]
        public async Task<ActionResult<TwoFactorEnableResponse>> RegenerateBackupCodes([FromBody] TwoFactorVerifyRequest request)
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);

            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            if (!ValidateTotp(profile.TwoFactorSecret, request.Code))
            {
                return BadRequest(new { message = "Invalid authentication code." });
            }

            var backupCodes = GenerateBackupCodes();
            profile.BackupCodesHash = backupCodes.Select(HashBackupCode).ToList();
            profile.BackupCodesGeneratedAt = DateTime.UtcNow;
            await _securityProfileRepository.UpsertAsync(profile);

            return Ok(new TwoFactorEnableResponse { BackupCodes = backupCodes });
        }

        [HttpGet("sessions")]
        public async Task<ActionResult<List<AccountSessionResponse>>> GetSessions()
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            await GetOrCreateProfileAsync(userId, email, emailVerified);
            await TouchSessionAsync(userId);
            var sessions = await _sessionRepository.GetByUserAsync(userId);

            return Ok(sessions.Select(session => new AccountSessionResponse
            {
                Id = session.SessionId,
                DeviceName = session.DeviceName,
                IpAddress = session.IpAddress,
                Location = session.Location,
                LastSeenAt = session.LastSeenAt
            }).ToList());
        }

        [HttpPost("sessions/{sessionId}/revoke")]
        public async Task<IActionResult> RevokeSession(string sessionId)
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            await GetOrCreateProfileAsync(userId, email, emailVerified);
            await _sessionRepository.RevokeAsync(userId, sessionId);
            return Ok();
        }

        [HttpPost("sessions/revoke-all")]
        public async Task<IActionResult> RevokeAllSessions()
        {
            var (userId, email, emailVerified, _) = GetUserIdentity();
            var sessionId = GetSessionId();
            await GetOrCreateProfileAsync(userId, email, emailVerified);
            await _sessionRepository.RevokeAllAsync(userId, sessionId);
            return Ok();
        }

        [HttpGet("security-report")]
        public async Task<IActionResult> DownloadReport()
        {
            var (userId, email, emailVerified, displayName) = GetUserIdentity();
            var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);
            var sessions = await _sessionRepository.GetByUserAsync(userId);

            var report = new
            {
                profile.Email,
                EmailVerified = emailVerified,
                profile.IsTwoFactorEnabled,
                profile.LastPasswordChangeAt,
                ActiveSessions = sessions.Select(session => new
                {
                    session.DeviceName,
                    session.IpAddress,
                    session.Location,
                    session.LastSeenAt
                }).ToList(),
                GeneratedAt = DateTime.UtcNow
            };

            var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(report, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            return File(bytes, "application/json", $"{displayName ?? "security"}-report.json");
        }

        [HttpPost("delete")]
        public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest request)
        {
            var (userId, email, emailVerified, displayName) = GetUserIdentity();

            if (!string.Equals(request.Confirmation, "DELETE", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Type DELETE to confirm." });
            }

            if (!await ValidatePasswordAsync(request.Password))
            {
                return BadRequest(new { message = "Invalid password." });
            }

            if (!string.IsNullOrWhiteSpace(request.TwoFactorCode))
            {
                var profile = await GetOrCreateProfileAsync(userId, email, emailVerified);
                if (!ValidateTotp(profile.TwoFactorSecret, request.TwoFactorCode))
                {
                    return BadRequest(new { message = "Invalid authentication code." });
                }
            }

            var accessToken = GetAccessToken();
            await _keycloakAccountService.DeleteAccountAsync(accessToken);
            await _sessionRepository.RevokeAllAsync(userId, null);

            return Ok();
        }

        private (string userId, string email, bool emailVerified, string? displayName) GetUserIdentity()
        {
            var email = User.FindFirstValue("email") ?? User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            var displayName = User.FindFirstValue("preferred_username") ?? User.FindFirstValue("name");
            var userId = email;

            var verifiedClaim = User.FindFirstValue("email_verified");
            var emailVerified = bool.TryParse(verifiedClaim, out var parsed) && parsed;

            if (string.IsNullOrWhiteSpace(userId))
            {
                userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? displayName ?? Guid.NewGuid().ToString("N");
            }

            return (userId, email, emailVerified, displayName);
        }

        private string GetAccessToken()
        {
            var header = HttpContext.Request.Headers.Authorization.ToString();
            return header.Replace("Bearer ", string.Empty);
        }

        private async Task<AccountSecurityProfile> GetOrCreateProfileAsync(string userId, string email, bool emailVerified)
        {
            var profile = await _securityProfileRepository.GetByUserIdAsync(userId);
            if (profile != null)
            {
                profile.Email = email;
                profile.EmailVerified = emailVerified;
                return await _securityProfileRepository.UpsertAsync(profile);
            }

            var newProfile = new AccountSecurityProfile
            {
                UserId = userId,
                Email = email,
                EmailVerified = emailVerified,
                MemberSince = DateTime.UtcNow
            };

            return await _securityProfileRepository.UpsertAsync(newProfile);
        }

        private async Task<bool> ValidatePasswordAsync(string password)
        {
            var username = User.FindFirstValue("preferred_username") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(username))
            {
                return false;
            }

            return await _keycloakAccountService.ValidatePasswordAsync(username, password);
        }

        private async Task TouchSessionAsync(string userId)
        {
            var sessionId = GetSessionId();
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                return;
            }

            var userAgent = HttpContext.Request.Headers.UserAgent.ToString();
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";

            var existing = await _sessionRepository.GetBySessionIdAsync(userId, sessionId);
            var now = DateTime.UtcNow;

            var session = existing ?? new AccountSession
            {
                UserId = userId,
                SessionId = sessionId,
                CreatedAt = now
            };

            session.LastSeenAt = now;
            session.UserAgent = userAgent;
            session.IpAddress = ipAddress;
            session.DeviceName = GuessDeviceName(userAgent);
            session.Location = "Unknown";

            await _sessionRepository.UpsertAsync(session);
        }

        private string GetSessionId()
        {
            return User.FindFirstValue("sid")
                   ?? User.FindFirstValue("session_state")
                   ?? User.FindFirstValue("jti")
                   ?? string.Empty;
        }

        private static string GenerateQrCode(string payload)
        {
            var generator = new QRCodeGenerator();
            var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
            var qrCode = new PngByteQRCode(data);
            var bytes = qrCode.GetGraphic(6);
            return Convert.ToBase64String(bytes);
        }

        private static bool ValidateTotp(string secret, string code)
        {
            if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(code))
            {
                return false;
            }

            var bytes = Base32Encoding.ToBytes(secret);
            var totp = new Totp(bytes);
            return totp.VerifyTotp(code, out _, new VerificationWindow(2, 2));
        }

        private static List<string> GenerateBackupCodes()
        {
            var codes = new List<string>();
            using var rng = RandomNumberGenerator.Create();

            for (var index = 0; index < 8; index++)
            {
                var bytes = new byte[4];
                rng.GetBytes(bytes);
                codes.Add($"{BitConverter.ToUInt32(bytes, 0):D8}");
            }

            return codes;
        }

        private static string HashBackupCode(string code)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(code));
            return Convert.ToBase64String(bytes);
        }

        private static string GuessDeviceName(string userAgent)
        {
            if (userAgent.Contains("Firefox", StringComparison.OrdinalIgnoreCase))
            {
                return "Firefox";
            }
            if (userAgent.Contains("Edg", StringComparison.OrdinalIgnoreCase))
            {
                return "Edge";
            }
            if (userAgent.Contains("Chrome", StringComparison.OrdinalIgnoreCase))
            {
                return "Chrome";
            }
            if (userAgent.Contains("Safari", StringComparison.OrdinalIgnoreCase))
            {
                return "Safari";
            }
            return "Browser";
        }
    }

    public class AccountSecurityResponse
    {
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public bool EmailVerified { get; set; }
        public DateTime MemberSince { get; set; }
        public bool IsTwoFactorEnabled { get; set; }
        public DateTime? LastPasswordChangeAt { get; set; }
        public DateTime? BackupCodesGeneratedAt { get; set; }
        public bool HasBackupCodes { get; set; }
    }

    public class ChangeEmailRequest
    {
        public string NewEmail { get; set; }
        public string Password { get; set; }
    }

    public class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; }
        public string NewPassword { get; set; }
    }

    public class TwoFactorSetupResponse
    {
        public string OtpauthUri { get; set; }
        public string QrPngBase64 { get; set; }
        public string ManualKey { get; set; }
    }

    public class TwoFactorVerifyRequest
    {
        public string Code { get; set; }
        public string Password { get; set; }
    }

    public class TwoFactorEnableResponse
    {
        public List<string> BackupCodes { get; set; }
    }

    public class AccountSessionResponse
    {
        public string Id { get; set; }
        public string DeviceName { get; set; }
        public string IpAddress { get; set; }
        public string Location { get; set; }
        public DateTime LastSeenAt { get; set; }
    }

    public class DeleteAccountRequest
    {
        public string Confirmation { get; set; }
        public string Password { get; set; }
        public string? TwoFactorCode { get; set; }
    }
}
