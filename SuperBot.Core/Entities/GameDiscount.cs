namespace SuperBot.Core.Entities;

public class GameDiscount
{
    public string? Id { get; set; }
    public string GameId { get; set; } = string.Empty;
    public decimal DiscountPercent { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    public bool IsActiveAt(DateTime utcNow)
    {
        return utcNow >= StartDate && utcNow <= EndDate;
    }
}
