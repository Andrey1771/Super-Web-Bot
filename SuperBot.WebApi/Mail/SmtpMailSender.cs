using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Единая точка отправки писем. Сегодня — SMTP (в dev это Mailpit, http://localhost:8025);
/// при переезде на ESP (Brevo/Resend/…) меняется только эта реализация, вызывающий код не трогаем.
/// </summary>
public interface IMailSender
{
    /// <param name="htmlBody">Опционально: HTML-версия. Если null — уйдёт plain text.</param>
    Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default);
}

public class SmtpMailSender : IMailSender
{
    private readonly MailOptions _options;
    private readonly ILogger<SmtpMailSender> _logger;

    public SmtpMailSender(IOptions<MailOptions> options, ILogger<SmtpMailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// Домены, которых не бывает (RFC 2606/6761): демо-админ — demo-admin@taleshop-demo.invalid, покупатели наполнения
    /// демо — @example.com. Письмо туда вернётся отказом, а отказы портят репутацию домена у почтового сервиса.
    /// </summary>
    public static bool IsUndeliverable(string address)
    {
        var at = address.LastIndexOf('@');
        if (at < 0)
        {
            return true;
        }
        var domain = address[(at + 1)..].Trim().TrimEnd('.').ToLowerInvariant();
        return domain is "example.com" or "example.net" or "example.org" or "localhost"
            || domain.EndsWith(".invalid") || domain.EndsWith(".test") || domain.EndsWith(".example") || domain.EndsWith(".localhost")
            || domain.EndsWith(".example.com") || domain.EndsWith(".example.net") || domain.EndsWith(".example.org");
    }

    public async Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default)
    {
        if (IsUndeliverable(to))
        {
            _logger.LogInformation("Mail not sent to a reserved domain {To}: {Subject}", to, subject);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromAddress, _options.FromName),
            Subject = subject,
            Body = textBody,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8,
        };
        message.To.Add(to);

        if (!string.IsNullOrWhiteSpace(htmlBody))
        {
            message.AlternateViews.Add(
                AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, "text/html"));
        }

        await SmtpClients.SendAsync(_options, message, cancellationToken);
        _logger.LogInformation("Mail sent to {To}: {Subject}", to, subject);
    }
}
