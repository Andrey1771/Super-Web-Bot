using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces;

/// <summary>
/// Программа лояльности: начисление кэшбэка за оплаченные заказы, откат при возврате,
/// сводка и история для кабинета. Списание баллов на чекауте живёт в ценообразовании.
/// Все операции идемпотентны по заказу и не роняют платёжный флоу при сбое (best-effort).
/// </summary>
public interface ICashbackService
{
    bool Enabled { get; }

    /// <summary>Тиры программы (для публичной страницы /rewards).</summary>
    IReadOnlyList<CashbackTier> Tiers { get; }

    /// <summary>
    /// Начисляет кэшбэк за только что оплаченный заказ. Ставка — по тиру от суммы трат
    /// ДО этого заказа. Повторный вызов по тому же заказу — no-op (уникальный индекс).
    /// </summary>
    Task AccrueForOrderAsync(Order order);

    /// <summary>Откатывает начисление по заказу при полном возврате/чарджбеке. Идемпотентно.</summary>
    Task ReverseForOrderAsync(string orderId);

    Task<CashbackSummary> GetSummaryAsync(string userId);

    Task<IReadOnlyList<CashbackTransaction>> GetHistoryAsync(string userId, int limit);
}

/// <summary>Сводка кошелька для кабинета: баланс, текущий тир и прогресс к следующему.</summary>
public class CashbackSummary
{
    public bool Enabled { get; set; } = true;
    public decimal Balance { get; set; }
    public decimal LifetimeEarned { get; set; }
    public decimal LifetimeSpent { get; set; }

    public string CurrentTierName { get; set; } = string.Empty;
    public decimal CurrentRatePercent { get; set; }

    public string? NextTierName { get; set; }
    public decimal? NextTierRatePercent { get; set; }
    public decimal? NextTierThreshold { get; set; }

    /// <summary>Сколько ещё потратить до следующего тира (null, если тир максимальный).</summary>
    public decimal? AmountToNextTier { get; set; }

    /// <summary>Прогресс внутри текущего тира к следующему, 0..100 (100, если тир максимальный).</summary>
    public decimal ProgressPercent { get; set; }
}
