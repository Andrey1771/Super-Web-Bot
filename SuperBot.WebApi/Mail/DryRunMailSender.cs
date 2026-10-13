namespace SuperBot.WebApi.Mail;

/// <summary>
/// Mail:DryRun — письмо не уходит, в лог пишется только адресат и тема. Для наполнения демо (demo-seed): адреса
/// покупателей там выдуманные, а письма на несуществующие ящики портят репутацию домена у почтового сервиса.
/// </summary>
public sealed class DryRunMailSender(ILogger<DryRunMailSender> logger) : IMailSender
{
    public Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Mail dry run, not sent to {To}: {Subject}", to, subject);
        return Task.CompletedTask;
    }
}
