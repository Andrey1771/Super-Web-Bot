namespace SuperBot.Core.Interfaces;

public interface IPromoCodeService
{
    Task<PromoValidationResult> ValidateAsync(PromoValidationRequest request);
    Task RecordUsageAsync(PromoApplyRequest request);

    /// <summary>
    /// Записывает использование промокода оплаченным заказом — без повторной проверки: скидку
    /// уже посчитали при создании платежа, и деньги списаны именно с ней. Повторная проверка
    /// после оплаты отказала бы «только для первого заказа» (заказ уже есть) и «последнему»
    /// по лимиту. Идемпотентно по заказу: повторный вызов для того же заказа ничего не пишет.
    /// Возвращает false, если кода нет или запись для заказа уже была.
    /// </summary>
    Task<bool> RecordRedemptionAsync(string code, string userName, string orderId);
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
    /// <summary>Код сообщения для словаря витрины («promo.applied», «promo.notFound»); Message — английский запас.</summary>
    public string? MessageCode { get; set; }
    public string? PromoCodeId { get; set; }
    public string? NormalizedCode { get; set; }
}
