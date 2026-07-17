using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Единая точка отправки писем. Сегодня — SMTP (в dev это MailHog, http://localhost:8025);
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

    public async Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default)
    {
        using var client = new SmtpClient(_options.SmtpHost, _options.SmtpPort);
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

        await client.SendMailAsync(message, cancellationToken);
        _logger.LogInformation("Mail sent to {To}: {Subject}", to, subject);
    }
}
