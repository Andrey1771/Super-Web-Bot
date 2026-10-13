using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ITarotSettingsRepository
    {
        Task<TarotSettings?> GetAsync();
        Task<TarotSettings> UpsertAsync(TarotSettings settings);
    }

    public interface ITarotDrawRepository
    {
        Task<TarotDraw?> GetLatestByUserAsync(string userId);

        /// <summary>
        /// Атомарно занимает право на розыгрыш до expiresAt. false — уже занято
        /// (кулдаун не истёк ЛИБО параллельный запрос успел первым).
        /// Проверять кулдауном отдельно нельзя: между проверкой и записью есть зазор,
        /// в который проходит второй запрос и выдаёт лишний промокод.
        /// </summary>
        Task<bool> TryAcquireDrawLockAsync(string userId, DateTime expiresAtUtc);

        /// <summary>Освободить лок, если розыгрыш сорвался, — иначе пользователь ждёт зря.</summary>
        Task ReleaseDrawLockAsync(string userId);

        Task<TarotDraw> CreateAsync(TarotDraw draw);
        Task<long> CountAsync();
        Task<long> CountSinceAsync(DateTime sinceUtc);
        /// <summary>Последние розыгрыши (новые первыми) — для подсчёта применённых кодов в админке.</summary>
        Task<List<TarotDraw>> GetRecentAsync(int limit);
    }
}
