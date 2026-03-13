using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

public class PaymentFinalizationStateDb
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string PaymentIntentId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
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
    public List<CheckoutLineItemStateDb> CheckoutItems { get; set; } = new();
}

public class CheckoutLineItemStateDb
{
    public string ProductType { get; set; } = "Game";
    public string? GameId { get; set; }
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
