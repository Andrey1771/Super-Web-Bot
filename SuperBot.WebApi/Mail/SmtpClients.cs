using System.Net;
using System.Net.Mail;

namespace SuperBot.WebApi.Mail;

/// <summary>
/// Единственное место, где создаётся SMTP-клиент. Раньше его собирали три сервиса сами и только
/// с адресом и портом — без логина и шифрования, поэтому письма уходили лишь в локальный Mailpit,
/// а настоящий почтовый сервис их бы не принял.
/// </summary>
public static class SmtpClients
{
    public static SmtpClient Create(MailOptions options)
    {
        var client = new SmtpClient(options.SmtpHost, options.SmtpPort)
        {
            DeliveryMethod = SmtpDeliveryMethod.Network,
            EnableSsl = options.SmtpUseTls,
        };

        if (!string.IsNullOrWhiteSpace(options.SmtpUsername))
        {
            client.UseDefaultCredentials = false;
            client.Credentials = new NetworkCredential(options.SmtpUsername, options.SmtpPassword);
        }

        return client;
    }
}
