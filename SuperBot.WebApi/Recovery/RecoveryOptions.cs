namespace SuperBot.WebApi.Recovery;

public class RecoveryOptions
{
    // Период ожидания между одобрением и исполнением — окно, в котором настоящий владелец может отменить.
    public int WaitingPeriodHours { get; set; } = 72;

    // Максимум заявок с одного IP в час (защита от перебора).
    public int MaxRequestsPerIpPerHour { get; set; } = 3;

    // SMTP для писем о восстановлении (в dev — mailhog).
    public string SmtpHost { get; set; } = "localhost";
    public int SmtpPort { get; set; } = 1025;
    public string FromAddress { get; set; } = "no-reply@taleshop.local";
    public string FromName { get; set; } = "Tale Shop";

    // Внешний адрес сайта для ссылок в письмах (отмена заявки).
    public string PublicBaseUrl { get; set; } = "http://localhost";
}
