using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

public class PaymentFinalizationStateDb
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string PaymentIntentId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    /// <summary>Страна покупателя, с которой считался чекаут — в заказ и в выдачу ключей.</summary>
    public string? BuyerCountry { get; set; }
    /// <summary>Язык покупателя на чекауте — в заказ, для писем.</summary>
    public string? Language { get; set; }
    public string Status { get; set; } = "Processing";
    public string? OrderId { get; set; }

    public int Attempts { get; set; }
    public string? LastErrorCode { get; set; }
    public string? LastErrorMessage { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public string Currency { get; set; } = "USD";
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal Total { get; set; }
    /// <summary>Оплачено кэшбэком (в валюте заказа и в долларах); картой — Total − CashbackApplied.</summary>
    public decimal CashbackApplied { get; set; }
    public decimal CashbackUsd { get; set; }
    /// <summary>Предварительный расчёт налога на кассе. Окончательный делается после оплаты — по стране карты.</summary>
    [BsonIgnoreIfNull]
    public OrderTaxDb? Tax { get; set; }
    public List<CheckoutLineItemStateDb> CheckoutItems { get; set; } = new();

    /// <summary>Идентификатор посетителя в GA, снятый при оформлении. Необязателен.</summary>
    [BsonIgnoreIfNull]
    public string? AnalyticsClientId { get; set; }

    /// <summary>Свой идентификатор посетителя. Необязателен.</summary>
    [BsonIgnoreIfNull]
    public string? VisitorId { get; set; }

    /// <summary>Первое касание посетителя. Необязательно.</summary>
    [BsonIgnoreIfNull]
    public OrderAttributionDb? Attribution { get; set; }

    /// <summary>
    /// Когда покупатель подтвердил немедленную выдачу ключей. Согласие даётся уже после
    /// создания намерения, но до оплаты, поэтому живёт здесь, а не в метаданных Stripe:
    /// оттуда его пришлось бы записывать раньше, чем человек его дал.
    /// </summary>
    [BsonIgnoreIfNull]
    public DateTime? DeliveryConsentAt { get; set; }

    /// <summary>Версия текста согласия — по ней видно, с чем именно согласились.</summary>
    [BsonIgnoreIfNull]
    public string? DeliveryConsentVersion { get; set; }

    /// <summary>
    /// Сам текст на момент согласия. Хранится копией: доказательством служит то, что человек
    /// видел, а не то, что лежит в коде сегодня.
    /// </summary>
    [BsonIgnoreIfNull]
    public string? DeliveryConsentText { get; set; }
}

public class CheckoutLineItemStateDb
{
    public string ProductType { get; set; } = "Game";
    public string? GameId { get; set; }
    public string? EditionCode { get; set; }
    public string? EditionTitle { get; set; }
    /// <summary>Вариант ключа: между оплатой и выдачей его терять нельзя — по нему выдаётся ключ.</summary>
    public string? OfferKey { get; set; }
    public string? OfferTitle { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? CoverUrl { get; set; }
    public string? Platform { get; set; }
    public string? Region { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPerUnit { get; set; }
    public decimal FinalUnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public string Currency { get; set; } = "USD";
}
