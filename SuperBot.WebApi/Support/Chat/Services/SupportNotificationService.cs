using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Options;
using SuperBot.Core.Entities;
using SuperBot.Core.Events;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Recovery;
using SuperBot.WebApi.Support.Chat.Models;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Alerts a human specialist when the AI escalates a chat. Reuses the project's Telegram bot
/// (AdminChatId) and the SMTP channel already configured for account recovery, so no new
/// infrastructure is required. Notifications are best-effort: a failure here must never break
/// the customer-facing escalation.
/// </summary>
public interface ISupportNotificationService
{
    Task NotifyEscalationAsync(ChatSession session, string summary, CancellationToken cancellationToken);
}

public class SupportNotificationService : ISupportNotificationService
{
    private readonly IBotEventPublisher _botEvents;
    private readonly RecoveryOptions _mailOptions;
    private readonly SupportChatOptions _chatOptions;
    private readonly ILogger<SupportNotificationService> _logger;

    public SupportNotificationService(
        IBotEventPublisher botEvents,
        IOptions<RecoveryOptions> mailOptions,
        IOptions<SupportChatOptions> chatOptions,
        ILogger<SupportNotificationService> logger)
    {
        _botEvents = botEvents;
        _mailOptions = mailOptions.Value;
        _chatOptions = chatOptions.Value;
        _logger = logger;
    }

    public async Task NotifyEscalationAsync(ChatSession session, string summary, CancellationToken cancellationToken)
    {
        if (_chatOptions.NotifyTelegramOnEscalation)
        {
            await SafeNotifyTelegramAsync(session, summary, cancellationToken);
        }

        if (_chatOptions.NotifyEmailOnEscalation)
        {
            await SafeNotifyEmailAsync(session, summary);
        }
    }

    private async Task SafeNotifyTelegramAsync(ChatSession session, string summary, CancellationToken cancellationToken)
    {
        try
        {
            var text = new StringBuilder()
                .AppendLine("🆘 Live chat needs a specialist")
                .AppendLine()
                .AppendLine($"Category: {session.Category ?? "—"}")
                .AppendLine($"Urgency: {FormatUrgency(session)}")
                .AppendLine($"Language: {session.Language ?? "—"}")
                .AppendLine($"Customer: {DescribeCustomer(session)}")
                .AppendLine($"Reason: {session.EscalationReason ?? "—"}")
                .AppendLine()
                .AppendLine("Summary:")
                .AppendLine(Truncate(summary, 900))
                .AppendLine()
                .AppendLine($"Open: {BuildSessionLink(session)}")
                .ToString();

            // Сайт не шлёт в Telegram сам — публикует событие, доставит бот-сервис.
            await _botEvents.PublishAsync(BotEventTypes.SupportEscalation, new SupportEscalationEvent(text));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish Telegram escalation notification for session {SessionId}", session.Id);
        }
    }

    private async Task SafeNotifyEmailAsync(ChatSession session, string summary)
    {
        var to = string.IsNullOrWhiteSpace(_chatOptions.SpecialistEmail)
            ? _mailOptions.FromAddress
            : _chatOptions.SpecialistEmail;

        if (string.IsNullOrWhiteSpace(to))
        {
            return;
        }

        try
        {
            var body = new StringBuilder()
                .AppendLine("A Tale Shop live chat was escalated to a human specialist.")
                .AppendLine()
                .AppendLine($"Category: {session.Category ?? "—"}")
                .AppendLine($"Urgency: {FormatUrgency(session)}")
                .AppendLine($"Language: {session.Language ?? "—"}")
                .AppendLine($"Customer: {DescribeCustomer(session)}")
                .AppendLine($"Reason: {session.EscalationReason ?? "—"}")
                .AppendLine()
                .AppendLine("Conversation summary:")
                .AppendLine(summary)
                .AppendLine()
                .AppendLine($"Open the conversation: {BuildSessionLink(session)}")
                .ToString();

            using var client = new SmtpClient(_mailOptions.SmtpHost, _mailOptions.SmtpPort);
            using var message = new MailMessage
            {
                From = new MailAddress(_mailOptions.FromAddress, _mailOptions.FromName),
                Subject = $"[Live chat] Specialist needed — {session.Category ?? "support"} ({FormatUrgency(session)})",
                Body = body
            };
            message.To.Add(to);
            await client.SendMailAsync(message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send email escalation notification for session {SessionId}", session.Id);
        }
    }

    private string BuildSessionLink(ChatSession session) =>
        $"{_mailOptions.PublicBaseUrl.TrimEnd('/')}/admin/support/live-chat?session={session.Id}";

    private static string DescribeCustomer(ChatSession session)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(session.Email)) parts.Add($"email {session.Email}");
        if (!string.IsNullOrWhiteSpace(session.OrderId)) parts.Add($"order {session.OrderId}");
        if (!string.IsNullOrWhiteSpace(session.UserId)) parts.Add($"user {session.UserId}");
        return parts.Count > 0 ? string.Join(", ", parts) : "guest (no contact provided)";
    }

    private static string FormatUrgency(ChatSession session) =>
        session.Priority.ToString().ToLowerInvariant();

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max] + "…";
}
