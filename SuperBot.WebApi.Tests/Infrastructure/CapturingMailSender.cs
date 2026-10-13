using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using SuperBot.WebApi.Mail;

namespace SuperBot.WebApi.Tests.Infrastructure;

public record CapturedMail(string To, string Subject, string TextBody, string? HtmlBody);

/// <summary>
/// Подменяет SMTP в тестах: письма не отправляются, а копятся в памяти —
/// тесты проверяют получателя, тему и вытаскивают токены из ссылок.
/// </summary>
public class CapturingMailSender : IMailSender
{
    private readonly ConcurrentQueue<CapturedMail> _sent = new();

    public IReadOnlyList<CapturedMail> Sent => _sent.ToList();

    public Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default)
    {
        _sent.Enqueue(new CapturedMail(to, subject, textBody, htmlBody));
        return Task.CompletedTask;
    }

    public void Clear()
    {
        while (_sent.TryDequeue(out _))
        {
        }
    }

    public CapturedMail? LastTo(string email) =>
        Sent.LastOrDefault(mail => string.Equals(mail.To, email, StringComparison.OrdinalIgnoreCase));

    public IReadOnlyList<CapturedMail> AllTo(string email) =>
        Sent.Where(mail => string.Equals(mail.To, email, StringComparison.OrdinalIgnoreCase)).ToList();

    /// <summary>Достаёт значение token=… из первой подходящей ссылки в теле письма.</summary>
    public static string ExtractToken(CapturedMail mail, string pathContains)
    {
        var match = Regex.Match(
            mail.TextBody,
            Regex.Escape(pathContains) + @"\?token=(?<token>[0-9a-f]+)",
            RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            throw new InvalidOperationException(
                $"No '{pathContains}?token=' link found in mail to {mail.To}:\n{mail.TextBody}");
        }
        return match.Groups["token"].Value;
    }
}
