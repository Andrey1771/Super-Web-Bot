using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

/// <summary>Запись журнала кэшбэка (коллекция <c>CashbackEntries</c>). Смысл полей — см. SuperBot.Core.Cashback.CashbackEntry.</summary>
[BsonIgnoreExtraElements]
public class CashbackEntryDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string UserKey { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public decimal AmountUsd { get; set; }
    [BsonIgnoreIfNull] public string? Status { get; set; }
    [BsonIgnoreIfNull] public string? OrderId { get; set; }
    [BsonIgnoreIfNull] public string? OrderNumber { get; set; }
    [BsonIgnoreIfNull] public string? GameTitle { get; set; }
    [BsonIgnoreIfNull] public string? GameCoverUrl { get; set; }
    [BsonIgnoreIfNull] public decimal? OrderTotalUsd { get; set; }
    [BsonIgnoreIfNull] public decimal? OrderTotal { get; set; }
    [BsonIgnoreIfNull] public string? OrderCurrency { get; set; }
    [BsonIgnoreIfNull] public decimal? Percent { get; set; }
    public DateTime CreatedAt { get; set; }
    [BsonIgnoreIfNull] public DateTime? UnlocksAt { get; set; }
    [BsonIgnoreIfNull] public DateTime? ExpiresAt { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    [BsonIgnoreIfNull] public string? Reference { get; set; }
    [BsonIgnoreIfNull] public string? Note { get; set; }
    [BsonIgnoreIfNull] public string? Actor { get; set; }
    [BsonIgnoreIfNull] public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Покупатель в программе (коллекция <c>CashbackAccounts</c>, _id — ключ покупателя).
/// Правда — в журнале; здесь только номер версии для очереди трат и снимок баланса для отчётов
/// админки, пересчитываемый после каждой записи.
/// </summary>
[BsonIgnoreExtraElements]
public class CashbackAccountDb
{
    [BsonId]
    public string UserKey { get; set; } = string.Empty;

    /// <summary>Растёт на каждом резерве: два одновременных резерва не потратят одни и те же деньги.</summary>
    public long Version { get; set; }

    public decimal AvailableUsd { get; set; }
    public decimal PendingUsd { get; set; }
    public decimal ReservedUsd { get; set; }
    public decimal EarnedAllTimeUsd { get; set; }
    public decimal UsedAllTimeUsd { get; set; }
    public decimal QualifyingSpendUsd { get; set; }
    public DateTime UpdatedAt { get; set; }
}
