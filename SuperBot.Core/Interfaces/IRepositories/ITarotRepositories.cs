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
        Task<TarotDraw> CreateAsync(TarotDraw draw);
        Task<long> CountAsync();
        Task<long> CountSinceAsync(DateTime sinceUtc);
        /// <summary>Последние розыгрыши (новые первыми) — для подсчёта применённых кодов в админке.</summary>
        Task<List<TarotDraw>> GetRecentAsync(int limit);
    }
}
