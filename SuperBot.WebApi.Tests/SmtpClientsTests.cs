using MailKit.Security;
using SuperBot.WebApi.Mail;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Шифрование SMTP для всей почты: 465 — сразу (так принимает Cloudflare Email Sending), 587 — STARTTLS,
/// Mailpit на стенде — без шифрования. И отказ от настроек, с которыми письма молча не ушли бы.
/// </summary>
public class SmtpClientsTests
{
    [Theory]
    [InlineData(465, false, SecureSocketOptions.SslOnConnect)]
    [InlineData(465, true, SecureSocketOptions.SslOnConnect)]
    [InlineData(587, true, SecureSocketOptions.StartTls)]
    [InlineData(1025, false, SecureSocketOptions.None)]
    public void Port_and_tls_setting_pick_the_encryption(int port, bool useTls, SecureSocketOptions expected)
    {
        Assert.Equal(expected, SmtpClients.SecurityFor(new MailOptions { SmtpHost = "smtp.example.com", SmtpPort = port, SmtpUseTls = useTls }));
    }

    [Fact]
    public void Username_without_password_is_rejected()
    {
        Assert.NotNull(new MailOptions { SmtpHost = "smtp.example.com", SmtpPort = 587, SmtpUsername = "user" }.Validate());
    }

    [Theory]
    [InlineData(587, true)]
    [InlineData(465, false)]
    public void Valid_settings_pass(int port, bool useTls)
    {
        Assert.Null(new MailOptions { SmtpHost = "smtp.example.com", SmtpPort = port, SmtpUsername = "api_token", SmtpPassword = "p", SmtpUseTls = useTls }.Validate());
    }
}
