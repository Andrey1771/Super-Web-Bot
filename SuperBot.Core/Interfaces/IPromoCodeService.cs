namespace SuperBot.Core.Interfaces;

public interface IPromoCodeService
{
    Task<PromoValidationResult> ValidateAsync(PromoValidationRequest request);
    Task RecordUsageAsync(PromoApplyRequest request);
}

public class PromoValidationRequest
{
    public string Code { get; set; } = string.Empty;
    public decimal CartSubtotal { get; set; }
    public string? UserName { get; set; }

    /// <summary>
    /// Валюта корзины. Нужна промокодам с абсолютными суммами: без неё «минус 10» применилось бы
    /// к любой валюте как своё. Пусто — проверка валюты не выполняется (старые вызывающие).
    /// </summary>
    public string? Currency { get; set; }
}

public class PromoApplyRequest
{
    public string Code { get; set; } = string.Empty;
    public decimal CartSubtotal { get; set; }
    public string? UserName { get; set; }
    public string? OrderId { get; set; }
}

public class PromoValidationResult
{
    public bool Valid { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal FinalTotal { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? PromoCodeId { get; set; }
    public string? NormalizedCode { get; set; }
}
