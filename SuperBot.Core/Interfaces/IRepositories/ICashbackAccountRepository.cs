using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface ICashbackAccountRepository
{
    Task<CashbackAccount?> GetByUserIdAsync(string userId);

    /// <summary>
    /// Атомарно двигает кошелёк ($inc по трём полям) и возвращает состояние ПОСЛЕ изменения.
    /// Создаёт документ, если его ещё не было (upsert). Balance зажимается в 0 вызывающим —
    /// репозиторий выполняет чистый инкремент.
    /// </summary>
    Task<CashbackAccount> IncrementAsync(string userId, decimal balanceDelta, decimal earnedDelta, decimal spentDelta);

    /// <summary>Разовая жёсткая простановка баланса (для клампа в 0 после реверса).</summary>
    Task SetBalanceAsync(string userId, decimal balance);
}
