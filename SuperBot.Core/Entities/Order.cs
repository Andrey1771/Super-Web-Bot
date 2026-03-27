
namespace SuperBot.Core.Entities
{
    public class Order
    {
        public Guid Id { get; set; }
        public string GameId { get; set; }
        public string GameName { get; set; }
        public string UserName { get; set; }
        public bool IsPaid { get; set; }
        public bool IsFulfilled { get; set; }
        public DateTime OrderDate { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? Status { get; set; }
        public string? PaymentStatus { get; set; }
        public string? FulfillmentStatus { get; set; }
        public decimal? TotalAmount { get; set; }
        public string? PromoCode { get; set; }
        public decimal? PromoDiscountAmount { get; set; }
        public string? Currency { get; set; }
        public string? Notes { get; set; }
    }
}
