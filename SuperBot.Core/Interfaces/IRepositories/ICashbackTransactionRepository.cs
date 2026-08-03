using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface ICashbackTransactionRepository
{
    /// <summary>
    /// Пишет запись леджера. Возвращает false, если такая (OrderId, Type) уже есть —
    /// это и есть гейт идемпотентности начисления/списания/реверса.
    /// </summary>
    Task<bool> TryInsertAsync(CashbackTransaction transaction);

    /// <summary>Проставляет BalanceAfter после того, как кошелёк реально сдвинут.</summary>
    Task SetBalanceAfterAsync(string transactionId, decimal balanceAfter);

    Task<IReadOnlyList<CashbackTransaction>> GetByUserAsync(string userId, int limit);

    /// <summary>Начисление по заказу (для реверса нужно знать сумму начисленного).</summary>
    Task<CashbackTransaction?> GetByOrderAndTypeAsync(string orderId, CashbackTransactionType type);
}
