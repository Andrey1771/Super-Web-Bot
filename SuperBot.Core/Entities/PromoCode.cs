namespace SuperBot.Core.Entities;

public class PromoCode
{
    public string? Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public PromoCodeType Type { get; set; }
    public decimal Value { get; set; }

    /// <summary>
    /// Валюта абсолютных сумм промокода (<see cref="Value"/> при <see cref="PromoCodeType.Fixed"/>,
    /// <see cref="MinOrderAmount"/>, <see cref="MaxDiscountAmount"/>). Пусто — валюта каталога USD,
    /// как у всех промокодов, заведённых до мультивалютности.
    /// Процентные промокоды валютно-нейтральны, и это поле на них не влияет.
    /// </summary>
    public string? Currency { get; set; }

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

    /// <summary>
    /// Есть ли у промокода суммы, смысл которых зависит от валюты. Процент валютно-нейтрален,
    /// а вот «минус 10» и «от 50 в заказе» — это конкретные деньги.
    /// </summary>
    public bool HasAbsoluteAmounts =>
        Type == PromoCodeType.Fixed || MinOrderAmount.HasValue || MaxDiscountAmount.HasValue;

    /// <summary>
    /// Подходит ли промокод корзине в этой валюте. «Минус 10 USD» в корзине за евро — это
    /// не та же скидка, поэтому такой промокод просто не применяется. Пересчёт по курсу
    /// сюда сознательно не встроен: скидка — обещание маркетинга, а не производная от курса.
    /// </summary>
    public bool AppliesToCurrency(string? cartCurrency)
    {
        if (!HasAbsoluteAmounts || string.IsNullOrWhiteSpace(cartCurrency))
        {
            return true;
        }

        var own = string.IsNullOrWhiteSpace(Currency) ? Payments.GamePricing.LegacyCurrency : Currency.Trim();
        return string.Equals(own, cartCurrency.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
