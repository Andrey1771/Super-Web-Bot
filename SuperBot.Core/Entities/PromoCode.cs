namespace SuperBot.Core.Entities;

public class PromoCode
{
    public string? Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public PromoCodeType Type { get; set; }
    public decimal Value { get; set; }
    public decimal? MinOrderAmount { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public bool FirstOrderOnly { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? UsageLimit { get; set; }
    public int? UsagePerUser { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsActiveAt(DateTime nowUtc)
    {
        return nowUtc >= StartDate && nowUtc <= EndDate;
    }
}
