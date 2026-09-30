using System.Net.Mail;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Mail;
using SuperBot.WebApi.Recovery.Models;

namespace SuperBot.WebApi.Recovery.Services;

// Письма процесса восстановления. Бэкенд шлёт их сам (в отличие от action-писем Keycloak),
// потому что уведомлять владельца нужно и когда заявку подал посторонний.
// Язык — тот, на котором заявитель подавал заявку (RecoveryRequest.Language); неизвестен — английский.
public class RecoveryMailService
{
    private readonly RecoveryOptions _options;
    private readonly ILogger<RecoveryMailService> _logger;

    public RecoveryMailService(IOptions<RecoveryOptions> options, ILogger<RecoveryMailService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public Task SendRequestCreatedAsync(RecoveryRequest request)
    {
        var t = MailTexts.For(request.Language);
        return SendAsync(request.AccountEmail,
            t.F("recovery.createdSubject", request.PublicId),
            t.F("recovery.createdBody", request.PublicId, request.CreatedAt.ToString("u"), request.RequestIp, CancelUrl(request)));
    }

    public Task SendRequestApprovedAsync(RecoveryRequest request)
    {
        var t = MailTexts.For(request.Language);
        return SendAsync(request.AccountEmail,
            t.F("recovery.approvedSubject", request.PublicId),
            t.F("recovery.approvedBody", request.PublicId, request.ExecuteAfter?.ToString("u"), CancelUrl(request)));
    }

    public Task SendRequestCancelledAsync(RecoveryRequest request)
    {
        var t = MailTexts.For(request.Language);
        return SendAsync(request.AccountEmail,
            t.F("recovery.cancelledSubject", request.PublicId),
            t.F("recovery.cancelledBody", request.PublicId));
    }

    public Task SendRequestRejectedAsync(RecoveryRequest request)
    {
        var t = MailTexts.For(request.Language);
        return SendAsync(request.ContactEmail,
            t.F("recovery.rejectedSubject", request.PublicId),
            t.F("recovery.rejectedBody", request.PublicId, _options.PublicBaseUrl));
    }

    public Task SendRequestExecutedAsync(RecoveryRequest request)
    {
        var t = MailTexts.For(request.Language);
        return SendAsync(request.AccountEmail,
            t.F("recovery.executedSubject", request.PublicId),
            t.F("recovery.executedBody", request.PublicId));
    }

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
