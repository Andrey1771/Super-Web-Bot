using System.Net.Mail;
using MailKit.Security;
using MimeKit;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Единственное место, где письмо уходит на SMTP-сервер. Раньше клиент собирали три сервиса сами и только
/// с адресом и портом — без логина и шифрования, поэтому письма уходили лишь в локальный Mailpit.
///
/// Отправка — через MailKit: встроенный SmtpClient .NET умеет только STARTTLS (587), а Cloudflare Email Sending
/// (и многие другие сервисы) принимают письма только на 465 с шифрованием с первого байта.
/// </summary>
public static class SmtpClients
{
    /// <summary>465 — шифрование сразу (SMTPS); SmtpUseTls — STARTTLS; иначе без шифрования (Mailpit на стенде).</summary>
    public static SecureSocketOptions SecurityFor(MailOptions options) =>
        options.SmtpPort == 465 ? SecureSocketOptions.SslOnConnect
        : options.SmtpUseTls ? SecureSocketOptions.StartTls
        : SecureSocketOptions.None;

    public static async Task SendAsync(MailOptions options, MailMessage message, CancellationToken cancellationToken = default)
    {
        using var mime = MimeMessage.CreateFromMailMessage(message);
        using var client = new MailKit.Net.Smtp.SmtpClient();
        await client.ConnectAsync(options.SmtpHost, options.SmtpPort, SecurityFor(options), cancellationToken);
        if (!string.IsNullOrWhiteSpace(options.SmtpUsername))
        {
            await client.AuthenticateAsync(options.SmtpUsername, options.SmtpPassword ?? string.Empty, cancellationToken);
        }
        await client.SendAsync(mime, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }
}
