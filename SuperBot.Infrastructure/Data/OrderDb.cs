using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    // IgnoreExtraElements на всех документах заказа: коллекция пережила несколько форм позиций
    // (TitleSnapshot, Qty, UnitPriceSnapshot и т.д.), и неизвестное поле не должно валить чтение
    // всей страницы заказов — а именно так и падал /api/account/orders на старых документах.
    [BsonIgnoreExtraElements]
    public class OrderDb
    {
        [BsonId]
        public ObjectId Id { get; set; }

        public string OrderId { get; set; } = string.Empty;
        [BsonRepresentation(BsonType.String)]
        public Guid OrderGuid { get; set; }
        public string OrderNumber { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string PaymentProvider { get; set; } = "stripe";
        // Уникальный sparse-индекс ix_orders_payment_intent_unique исключает только ОТСУТСТВУЮЩЕЕ поле,
        // но не null. Заказы без Stripe-интента (Stars/корзина) не ставят PaymentIntentId → чтобы они не
        // коллизировали между собой по null, не сериализуем пустое значение вовсе (поле отсутствует в документе).
        [BsonIgnoreIfNull]
        [BsonIgnoreIfDefault]
        public string PaymentIntentId { get; set; }

        public string? PaidWithType { get; set; }
        public string? PaidWithBrand { get; set; }
        public string? PaidWithLast4 { get; set; }
        public string? PaidWithWallet { get; set; }

        public string GameId { get; set; } = string.Empty;
        public string GameName { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public bool IsPaid { get; set; }
        public string? BuyerCountry { get; set; }
        public string? Language { get; set; }
        public bool IsFulfilled { get; set; }
        public DateTime OrderDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? PaidAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public int SnapshotVersion { get; set; } = 1;
        public string? Status { get; set; }
        public string? PaymentStatus { get; set; }
        public string? FulfillmentStatus { get; set; }
        public decimal? TotalAmount { get; set; }
        public decimal? SubtotalAmount { get; set; }
        public decimal? DiscountTotal { get; set; }
        public decimal? TaxTotal { get; set; }
        public string? PromoCode { get; set; }
        public decimal? PromoDiscountAmount { get; set; }

        /// <summary>Идентификатор посетителя в GA (куки _ga) на момент оформления.</summary>
        [BsonIgnoreIfNull]
        public string? AnalyticsClientId { get; set; }

        /// <summary>
        /// Когда покупатель подтвердил немедленную выдачу ключей и то, что вместе с ней
        /// теряет право отказаться от заказа. Цифровой товар выдаётся сразу, поэтому такое
        /// согласие должно быть явным и сохранённым — иначе доказать его нечем.
        /// </summary>
        [BsonIgnoreIfNull]
        public DateTime? DeliveryConsentAt { get; set; }

        /// <summary>Версия текста согласия.</summary>
        [BsonIgnoreIfNull]
        public string? DeliveryConsentVersion { get; set; }

        /// <summary>Текст согласия на момент заказа.</summary>
        [BsonIgnoreIfNull]
        public string? DeliveryConsentText { get; set; }

        /// <summary>Свой идентификатор посетителя — связывает заказ с событиями воронки.</summary>
        [BsonIgnoreIfNull]
        public string? VisitorId { get; set; }

        /// <summary>Первое касание: откуда покупатель узнал о магазине. Необязательно.</summary>
        [BsonIgnoreIfNull]
        public OrderAttributionDb? Attribution { get; set; }

        /// <summary>
        /// Возвращено покупателю, в валюте заказа. Необязательное: у заказов без возврата
        /// поля нет, и это читается как «не возвращали». Миграция не нужна.
        /// </summary>
        [BsonIgnoreIfNull]
        public decimal? RefundedAmount { get; set; }

        /// <summary>Доля заказа, возвращённая по позициям — см. Order.RefundedShare. Нет поля — не возвращали.</summary>
        [BsonIgnoreIfNull]
        public decimal? RefundedShare { get; set; }

        /// <summary>Гость ещё не подтвердил почту — выдача ключей запрещена (включая бэкфилл).</summary>
        public bool RequiresDeliveryVerification { get; set; }
        /// <summary>Оформлен без входа в аккаунт — см. Order.PlacedAsGuest.</summary>
        public bool PlacedAsGuest { get; set; }
        /// <summary>Оплачено кэшбэком — см. Order.CashbackApplied.</summary>
        public decimal CashbackApplied { get; set; }
        public decimal CashbackUsd { get; set; }
        /// <summary>Налог из Stripe Tax — см. Order.Tax. У старых заказов поля нет.</summary>
        [BsonIgnoreIfNull]
        public OrderTaxDb? Tax { get; set; }
        /// <summary>Спор по оплате — см. Order.Dispute. У заказов без спора поля нет.</summary>
        [BsonIgnoreIfNull]
        public OrderDisputeDb? Dispute { get; set; }
        public string? Currency { get; set; }
        public string? Notes { get; set; }
        public MoneyTotalsDb Totals { get; set; } = new();
        public List<OrderEventDb> Events { get; set; } = new();
        public List<OrderItemSnapshotDb> Items { get; set; } = new();
    }

    [BsonIgnoreExtraElements]
    /// <summary>Первое касание посетителя. Все поля необязательны: меток могло не быть.</summary>
    public class OrderAttributionDb
    {
        [BsonIgnoreIfNull]
        public string? Source { get; set; }
        [BsonIgnoreIfNull]
        public string? Medium { get; set; }
        [BsonIgnoreIfNull]
        public string? Campaign { get; set; }
        [BsonIgnoreIfNull]
        public string? Referrer { get; set; }
        [BsonIgnoreIfNull]
        public string? LandingPath { get; set; }
        [BsonIgnoreIfNull]
        public DateTime? FirstSeenUtc { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class OrderTaxDb
    {
        public string Status { get; set; } = "pending";
        [BsonIgnoreIfNull] public string? CalculationId { get; set; }
        [BsonIgnoreIfNull] public string? TransactionId { get; set; }
        [BsonIgnoreIfNull] public string? LocationSource { get; set; }
        [BsonIgnoreIfNull] public string? Country { get; set; }
        [BsonIgnoreIfNull] public string? State { get; set; }
        [BsonIgnoreIfNull] public string? TaxType { get; set; }
        [BsonIgnoreIfNull] public decimal? RatePercent { get; set; }
        [BsonIgnoreIfNull] public string? TaxabilityReason { get; set; }
        public long AmountTotalMinor { get; set; }
        public long ReversedMinor { get; set; }
        [BsonIgnoreIfNull] public string? LastError { get; set; }
        [BsonIgnoreIfNull] public DateTime? RecordedAt { get; set; }

        /// <summary>Для мест без AutoMapper (состояние платежа): поля один в один.</summary>
        public static OrderTaxDb? From(SuperBot.Core.Entities.OrderTax? tax) => tax == null ? null : new OrderTaxDb
        {
            Status = tax.Status, CalculationId = tax.CalculationId, TransactionId = tax.TransactionId,
            LocationSource = tax.LocationSource, Country = tax.Country, State = tax.State, TaxType = tax.TaxType,
            RatePercent = tax.RatePercent, TaxabilityReason = tax.TaxabilityReason, AmountTotalMinor = tax.AmountTotalMinor,
            ReversedMinor = tax.ReversedMinor, LastError = tax.LastError, RecordedAt = tax.RecordedAt
        };

        public SuperBot.Core.Entities.OrderTax ToDomain() => new()
        {
            Status = Status, CalculationId = CalculationId, TransactionId = TransactionId,
            LocationSource = LocationSource, Country = Country, State = State, TaxType = TaxType,
            RatePercent = RatePercent, TaxabilityReason = TaxabilityReason, AmountTotalMinor = AmountTotalMinor,
            ReversedMinor = ReversedMinor, LastError = LastError, RecordedAt = RecordedAt
        };
    }

    [BsonIgnoreExtraElements]
    public class OrderDisputeDb
    {
        public string Id { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        [BsonIgnoreIfNull] public string? Reason { get; set; }
        public long AmountMinor { get; set; }
        public string Currency { get; set; } = "USD";
        [BsonIgnoreIfNull] public DateTime? EvidenceDueBy { get; set; }
        public bool HasEvidence { get; set; }
        public DateTime OpenedAt { get; set; }
        [BsonIgnoreIfNull] public DateTime? ClosedAt { get; set; }
        [BsonIgnoreIfNull] public string? Outcome { get; set; }
        [BsonIgnoreIfNull] public string? PaymentStatusBefore { get; set; }
    }

    public class MoneyTotalsDb
    {
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class OrderEventDb
    {
        public string Type { get; set; } = string.Empty;
        public string? Message { get; set; }
        public string? Actor { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [BsonIgnoreExtraElements]
    public class OrderItemSnapshotDb
    {
        public string ItemId { get; set; } = string.Empty;
        public string ProductType { get; set; } = "Game";
        public string? GameId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        public string? EditionCode { get; set; }
        public string? EditionTitle { get; set; }
        /// <summary>
        /// Региональный вариант ключа (см. OrderItemSnapshot.OfferKey). Без этих полей вариант
        /// терялся при сохранении: первая выдача ещё шла по заказу в памяти, а добор ключей
        /// при пополнении склада читал заказ из базы и брал ключ из любой группы.
        /// </summary>
        public string? OfferKey { get; set; }
        public string? OfferTitle { get; set; }
        public string? Slug { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal UnitDiscount { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        /// <summary>Возвращено штук — см. OrderItemSnapshot.RefundedQuantity. У старых заказов поля нет — ноль.</summary>
        [BsonIgnoreIfDefault]
        public int RefundedQuantity { get; set; }
        public PricingSnapshotDb Pricing { get; set; } = new();
        public DeliverySnapshotDb? Delivery { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class PricingSnapshotDb
    {
        public string PriceSource { get; set; } = "catalog";
        public string? PromoId { get; set; }
        public string? CouponCode { get; set; }
        public decimal? OriginalUnitPrice { get; set; }
        public decimal? DiscountPercent { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class DeliverySnapshotDb
    {
        public string DeliveryType { get; set; } = "Key";
        public List<DeliveredKeyDb> Keys { get; set; } = new();
        public DateTime? DeliveredAt { get; set; }
    }

    [BsonIgnoreExtraElements]
    public class DeliveredKeyDb
    {
        public string? KeyMasked { get; set; }
        public DateTime? DeliveredAt { get; set; }
    }
}
