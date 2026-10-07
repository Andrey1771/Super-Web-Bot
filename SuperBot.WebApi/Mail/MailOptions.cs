namespace SuperBot.WebApi.Mail;

/// <summary>
/// Общий SMTP-конфиг для всей исходящей почты: письма о заказах, рассылка, восстановление
/// доступа, уведомления поддержки. Если секция "Mail" не задана, адрес сервера и отправитель
/// подтягиваются из RecoveryOptions (см. Program.cs) — так старые окружения не ломаются.
/// </summary>
public class MailOptions
{
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; }

    /// <summary>Логин SMTP. Пусто — без авторизации (так работает Mailpit на стенде).</summary>
    public string? SmtpUsername { get; set; }

    public string? SmtpPassword { get; set; }

    /// <summary>
    /// STARTTLS. Настоящие почтовые сервисы (Mailgun, Postmark, Яндекс и т.п.) принимают письма
    /// только по шифрованному соединению — порт 587. Неявный TLS на 465 встроенный SmtpClient
    /// .NET не поддерживает, поэтому такой порт отклоняется при старте (см. Validate).
    /// </summary>
    public bool SmtpUseTls { get; set; }

    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "Tale Shop";

    /// <summary>Внешний адрес сайта — базовый URL для ссылок в письмах (confirm/unsubscribe).</summary>
    public string PublicBaseUrl { get; set; } = string.Empty;

    /// <summary>Ошибка конфигурации или null. Проверяется на старте, чтобы письма не терялись молча.</summary>
    public string? Validate()
    {
        if (SmtpPort == 465)
        {
            return "Mail:SmtpPort 465 (implicit TLS) is not supported by the .NET SMTP client. Use port 587 with Mail:SmtpUseTls=true (STARTTLS).";
        }
        if (!string.IsNullOrWhiteSpace(SmtpUsername) && string.IsNullOrEmpty(SmtpPassword))
        {
            return "Mail:SmtpUsername is set but Mail:SmtpPassword is empty.";
        }
        return null;
    }
}
