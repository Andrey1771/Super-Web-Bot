using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.WebApi.Newsletter;

/// <summary>Статусы подписчика. Отписка не удаляет документ — история и повторная подписка остаются возможными.</summary>
public static class SubscriberStatus
{
    public const string Pending = "pending";           // ждёт подтверждения по ссылке из письма
    public const string Confirmed = "confirmed";       // double opt-in пройден ИЛИ включено из личного кабинета
    public const string Unsubscribed = "unsubscribed"; // отписался; email и история сохраняются
}

public class NewsletterSubscriberDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>Нормализованный (lowercase) email; уникальный индекс — один документ на адрес.</summary>
    public string Email { get; set; } = string.Empty;

    public string Status { get; set; } = SubscriberStatus.Pending;

    /// <summary>Откуда приходили подписки: "deals", "homepage", "account".</summary>
    public List<string> Sources { get; set; } = new();

    /// <summary>Связь с аккаунтом (Keycloak sub), если подписка управлялась из личного кабинета.</summary>
    public string? UserId { get; set; }

    /// <summary>Язык сайта на момент подписки — задел под локализованные письма.</summary>
    public string? Locale { get; set; }

    /// <summary>Одноразовый токен подтверждения; обнуляется после confirm.</summary>
    public string? ConfirmToken { get; set; }

    /// <summary>Постоянный токен отписки — ссылка в футере каждого письма.</summary>
    public string UnsubscribeToken { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public DateTime? UnsubscribedAt { get; set; }
}

public static class CampaignStatus
{
    public const string Queued = "queued";
    public const string Sending = "sending";
    public const string Sent = "sent";
    public const string Failed = "failed";
}

public static class CampaignType
{
    public const string Manual = "manual"; // написана админом в /admin/newsletter
    public const string Digest = "digest"; // автодайджест новых скидок
}

public class NewsletterCampaignDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Type { get; set; } = CampaignType.Manual;
    public string Subject { get; set; } = string.Empty;

    /// <summary>Plain-text тело; HTML-обёртка добавляется при отправке.</summary>
    public string BodyText { get; set; } = string.Empty;

    public string Status { get; set; } = CampaignStatus.Queued;

    public int RecipientCount { get; set; }
    public int SentCount { get; set; }
    public int FailedCount { get; set; }

    /// <summary>Кто запустил (email админа) — для manual-кампаний.</summary>
    public string? CreatedBy { get; set; }

    /// <summary>Язык кампании ("en"/"ru"/…): уходит только подписчикам с этим Locale. null — всем (manual-кампании).</summary>
    public string? Locale { get; set; }

    /// <summary>Отложенная отправка: воркер не берёт кампанию из очереди раньше этого времени (UTC). null — сразу.</summary>
    public DateTime? ScheduledAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>Служебное состояние рассылки (одна запись на ключ) — например, момент последнего дайджеста.</summary>
public class NewsletterStateDb
{
    [BsonId]
    public string Id { get; set; } = string.Empty;

    public DateTime LastRunAt { get; set; }
}
