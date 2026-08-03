namespace SuperBot.Core.Entities;

/// <summary>
/// Кошелёк лояльности пользователя. Один документ на аккаунт (по UserId = ключ Keycloak,
/// тот же, что у заказов/ключей). Источник истины по движению баллов — леджер
/// <see cref="CashbackTransaction"/>; поля ниже — денормализованный кэш для быстрых чтений,
/// который двигается атомарными $inc вместе с записью в леджер.
/// </summary>
public class CashbackAccount
{
    public string? Id { get; set; }
    public string UserId { get; set; } = string.Empty;

    /// <summary>Доступный к списанию баланс в баллах (1 балл = 1 единица валюты расчёта).</summary>
    public decimal Balance { get; set; }

    /// <summary>Всего начислено за всё время (не уменьшается при списании, уменьшается при реверсе).</summary>
    public decimal LifetimeEarned { get; set; }

    /// <summary>Сумма зачтённых трат — определяет тир. Уменьшается при полном возврате заказа.</summary>
    public decimal LifetimeSpent { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
