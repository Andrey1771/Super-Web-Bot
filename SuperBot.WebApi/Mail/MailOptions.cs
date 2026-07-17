namespace SuperBot.WebApi.Mail;

/// <summary>
/// Общий SMTP-конфиг для всей исходящей почты (рассылка, поддержка, будущие сценарии).
/// Если секция "Mail" не задана, значения подтягиваются из RecoveryOptions (см. Program.cs),
/// поэтому существующие окружения работают без изменений env.
/// </summary>
public class MailOptions
{
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; }
    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "Tale Shop";

    /// <summary>Внешний адрес сайта — базовый URL для ссылок в письмах (confirm/unsubscribe).</summary>
    public string PublicBaseUrl { get; set; } = string.Empty;
}
