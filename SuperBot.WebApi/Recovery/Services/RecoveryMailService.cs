using System.Net.Mail;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Recovery.Models;

namespace SuperBot.WebApi.Recovery.Services;

// Письма процесса восстановления. Бэкенд шлёт их сам (в отличие от action-писем Keycloak),
// потому что уведомлять владельца нужно и когда заявку подал посторонний.
public class RecoveryMailService
{
    private readonly RecoveryOptions _options;
    private readonly ILogger<RecoveryMailService> _logger;

    public RecoveryMailService(IOptions<RecoveryOptions> options, ILogger<RecoveryMailService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public Task SendRequestCreatedAsync(RecoveryRequest request) =>
        SendAsync(request.AccountEmail,
            $"[{request.PublicId}] Account recovery requested",
            $"""
            Someone requested access recovery (two-factor authentication reset) for your Tale Shop account.

            Request: {request.PublicId}
            Submitted: {request.CreatedAt:u}
            From IP: {request.RequestIp}

            If this was YOU — no action is needed. Support will review the request; a reply can take up to a few days because of a mandatory waiting period.

            If this was NOT you, cancel the request now:
            {CancelUrl(request)}

            You can also cancel it from any device where you are still signed in (Account -> Security).

            Tale Shop will never ask for your password or authenticator codes.
            """);

    public Task SendRequestApprovedAsync(RecoveryRequest request) =>
        SendAsync(request.AccountEmail,
            $"[{request.PublicId}] Account recovery approved — waiting period started",
            $"""
            Your account recovery request {request.PublicId} passed verification.

            Two-factor authentication will be reset after: {request.ExecuteAfter:u} (UTC)

            If you did NOT request this, cancel immediately:
            {CancelUrl(request)}

            Cancelling is also available from any signed-in device (Account -> Security).
            """);

    public Task SendRequestCancelledAsync(RecoveryRequest request) =>
        SendAsync(request.AccountEmail,
            $"[{request.PublicId}] Account recovery cancelled",
            $"""
            The account recovery request {request.PublicId} was cancelled and nothing was changed.

            If you believe your account is being targeted, consider changing your password and reviewing active sessions in Account -> Security.
            """);

    public Task SendRequestRejectedAsync(RecoveryRequest request) =>
        SendAsync(request.ContactEmail,
            $"[{request.PublicId}] Account recovery request declined",
            $"""
            Unfortunately we could not verify ownership for recovery request {request.PublicId}, so it was declined.

            You can submit a new request with more details (order numbers, payment information) at {_options.PublicBaseUrl}/account-recovery.
            """);

    public Task SendRequestExecutedAsync(RecoveryRequest request) =>
        SendAsync(request.AccountEmail,
            $"[{request.PublicId}] Two-factor authentication was reset",
            $"""
            Recovery request {request.PublicId} was completed: two-factor authentication and backup codes were removed from your account, and all sessions were signed out.

            We sent you a separate email with a link to set a new password. After signing in, please re-enable two-factor authentication in Account -> Security.

            If this was NOT you, contact support immediately.
            """);

    private string CancelUrl(RecoveryRequest request) =>
        $"{_options.PublicBaseUrl.TrimEnd('/')}/account-recovery/cancel?token={Uri.EscapeDataString(request.CancelToken)}";

    private async Task SendAsync(string to, string subject, string body)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            return;
        }

        try
        {
            using var client = new SmtpClient(_options.SmtpHost, _options.SmtpPort);
            using var message = new MailMessage
            {
                From = new MailAddress(_options.FromAddress, _options.FromName),
                Subject = subject,
                Body = body
            };
            message.To.Add(to);
            await client.SendMailAsync(message);
        }
        catch (Exception ex)
        {
            // Письмо — уведомление, а не часть транзакции: заявка не должна падать из-за SMTP.
            _logger.LogError(ex, "Failed to send recovery mail '{Subject}' to {To}", subject, to);
        }
    }
}
