namespace SuperBot.Core.Entities;

public class PromoCodeUsage
{
    public string? Id { get; set; }
    public string PromoCodeId { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? OrderId { get; set; }
    public DateTime UsedAt { get; set; } = DateTime.UtcNow;
}
