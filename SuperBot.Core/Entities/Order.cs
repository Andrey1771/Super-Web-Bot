namespace SuperBot.Core.Entities
{
    public class Order
    {
        public Guid Id { get; set; }
        public string? OrderNumber { get; set; }
        public Guid OrderGuid { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string PaymentProvider { get; set; } = "stripe";
        public string? PaymentIntentId { get; set; }
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

        /// <summary>
        /// Гостевая покупка: true, пока покупатель не подтвердил почту по ссылке из письма.
        /// Пока флаг взведён, выдача ключей (включая бэкфилл при пополнении пула) запрещена.
        /// </summary>
        public bool RequiresDeliveryVerification { get; set; }
        public string? Currency { get; set; }
        public string? Notes { get; set; }
        public MoneyTotals Totals { get; set; } = new();
        public List<OrderEvent> Events { get; set; } = new();
        public List<OrderItemSnapshot> Items { get; set; } = new();
    }

    public class MoneyTotals
    {
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
    }

    public class OrderEvent
    {
        public string Type { get; set; } = string.Empty;
        public string? Message { get; set; }
        /// <summary>Кто это сделал: почта специалиста для ручных действий, null — система (вебхук, воркер).</summary>
        public string? Actor { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class OrderItemSnapshot
    {
        public string ItemId { get; set; } = Guid.NewGuid().ToString("N");
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
        public PricingSnapshot Pricing { get; set; } = new();
        public DeliverySnapshot? Delivery { get; set; }
    }

    public class PricingSnapshot
    {
        public string PriceSource { get; set; } = "catalog";
        public string? PromoId { get; set; }
        public string? CouponCode { get; set; }
        public decimal? OriginalUnitPrice { get; set; }
        public decimal? DiscountPercent { get; set; }
    }

    public class DeliverySnapshot
    {
        public string DeliveryType { get; set; } = "Key";
        public List<DeliveredKey> Keys { get; set; } = new();
        public DateTime? DeliveredAt { get; set; }
    }

    public class DeliveredKey
    {
        public string? KeyMasked { get; set; }
        public DateTime? DeliveredAt { get; set; }
    }
}
