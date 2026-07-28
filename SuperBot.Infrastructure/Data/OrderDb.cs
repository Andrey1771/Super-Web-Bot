using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
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

        public string GameId { get; set; } = string.Empty;
        public string GameName { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public bool IsPaid { get; set; }
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

        /// <summary>Гость ещё не подтвердил почту — выдача ключей запрещена (включая бэкфилл).</summary>
        public bool RequiresDeliveryVerification { get; set; }
        public string? Currency { get; set; }
        public string? Notes { get; set; }
        public MoneyTotalsDb Totals { get; set; } = new();
        public List<OrderEventDb> Events { get; set; } = new();
        public List<OrderItemSnapshotDb> Items { get; set; } = new();
    }

    public class MoneyTotalsDb
    {
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
    }

    public class OrderEventDb
    {
        public string Type { get; set; } = string.Empty;
        public string? Message { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class OrderItemSnapshotDb
    {
        public string ItemId { get; set; } = string.Empty;
        public string ProductType { get; set; } = "Game";
        public string? GameId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        public string? Slug { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal UnitDiscount { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        public PricingSnapshotDb Pricing { get; set; } = new();
        public DeliverySnapshotDb? Delivery { get; set; }

        public string TitleSnapshot { get; set; } = string.Empty;
        public string? CoverUrlSnapshot { get; set; }
        public string? PlatformSnapshot { get; set; }
        public string? RegionSnapshot { get; set; }
        public int Qty { get; set; }
        public decimal UnitPriceSnapshot { get; set; }
        public string UnitPriceCurrency { get; set; } = "USD";
        public decimal? DiscountSnapshot { get; set; }
        public decimal FinalUnitPriceSnapshot { get; set; }
        public decimal LineTotalSnapshot { get; set; }
        public string? DeliveryType { get; set; }
    }

    public class PricingSnapshotDb
    {
        public string PriceSource { get; set; } = "catalog";
        public string? PromoId { get; set; }
        public string? CouponCode { get; set; }
        public decimal? OriginalUnitPrice { get; set; }
        public decimal? DiscountPercent { get; set; }
    }

    public class DeliverySnapshotDb
    {
        public string DeliveryType { get; set; } = "Key";
        public List<DeliveredKeyDb> Keys { get; set; } = new();
        public DateTime? DeliveredAt { get; set; }
    }

    public class DeliveredKeyDb
    {
        public string? KeyMasked { get; set; }
        public DateTime? DeliveredAt { get; set; }
    }
}
