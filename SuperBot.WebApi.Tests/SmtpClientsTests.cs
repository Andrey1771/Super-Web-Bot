using System.Net;
using SuperBot.WebApi.Mail;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// SMTP-клиент для всей почты: с логином и STARTTLS для настоящего почтового сервиса, без них —
/// для Mailpit на стенде. И отказ от настроек, с которыми письма молча не ушли бы.
/// </summary>
public class SmtpClientsTests
{
    [Fact]
    public void Real_provider_settings_give_an_authenticated_encrypted_client()
    {
        using var client = SmtpClients.Create(new MailOptions
        {
            SmtpHost = "smtp.example.com",
            SmtpPort = 587,
            SmtpUsername = "postmaster@example.com",
            SmtpPassword = "secret",
            SmtpUseTls = true,
        });

        Assert.Equal("smtp.example.com", client.Host);
        Assert.Equal(587, client.Port);
        Assert.True(client.EnableSsl);
        var credentials = Assert.IsType<NetworkCredential>(client.Credentials);
        Assert.Equal("postmaster@example.com", credentials.UserName);
    }

    [Fact]
    public void Local_trap_settings_give_a_plain_client_without_credentials()
    {
        using var client = SmtpClients.Create(new MailOptions { SmtpHost = "mailpit", SmtpPort = 1025 });

        Assert.False(client.EnableSsl);
        Assert.Null(client.Credentials);
    }

    [Theory]
    [InlineData(465, null, null)]
    [InlineData(587, "user", null)]
    public void Settings_that_would_lose_mail_are_rejected(int port, string? username, string? password)
    {
        var options = new MailOptions { SmtpHost = "smtp.example.com", SmtpPort = port, SmtpUsername = username, SmtpPassword = password };
        Assert.NotNull(options.Validate());
    }

    [Fact]
    public void Valid_settings_pass()
    {
        Assert.Null(new MailOptions { SmtpHost = "smtp.example.com", SmtpPort = 587, SmtpUsername = "u", SmtpPassword = "p", SmtpUseTls = true }.Validate());
    }
}
