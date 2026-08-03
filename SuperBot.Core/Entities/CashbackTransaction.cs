namespace SuperBot.Core.Entities;

public enum CashbackTransactionType
{
    /// <summary>Начисление кэшбэка за оплаченный заказ.</summary>
    Earn = 0,

    /// <summary>Списание баллов как store credit при оплате заказа.</summary>
    Redeem = 1,

    /// <summary>Откат начисления при полном возврате/чарджбеке заказа.</summary>
    Reverse = 2
}

/// <summary>
/// Одна запись леджера кэшбэка. Уникальный индекс (OrderId, Type) обеспечивает идемпотентность:
/// один заказ не начислит и не спишет дважды даже при ретраях финализации/вебхука.
/// </summary>
public class CashbackTransaction
{
    public string? Id { get; set; }
    public string UserId { get; set; } = string.Empty;

    /// <summary>Заказ-источник движения. Часть ключа идемпотентности.</summary>
    public string? OrderId { get; set; }

    public CashbackTransactionType Type { get; set; }

    /// <summary>Модуль движения в баллах (всегда положительный; знак определяет Type).</summary>
    public decimal Amount { get; set; }

    /// <summary>Баланс кошелька после применения записи — для истории в кабинете.</summary>
    public decimal BalanceAfter { get; set; }

    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
