using Microsoft.Extensions.Logging;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Services
{
    public interface ITarotMaintenanceService
    {
        Task<long> PurgeExpiredCodesAsync();
    }

    /// <summary>
    /// Уборка за «картой удачи»: механика создаёт по одноразовому промокоду на каждый розыгрыш,
    /// и без чистки они копятся в админ-списке промокодов навсегда.
    /// Удаляются только протухшие коды с префиксом карты — ручные акции админа не трогаются.
    /// </summary>
    public class TarotMaintenanceService : ITarotMaintenanceService
    {
        /// <summary>Префикс кодов, которые выдаёт карта удачи (см. TarotController).</summary>
        public const string TarotCodePrefix = "TARO-";

        /// <summary>
        /// Даём протухшим кодам отлежаться: покупатель может открыть чекаут с кодом,
        /// который истёк минуту назад, и должен увидеть «срок истёк», а не «код не существует».
        /// </summary>
        private static readonly TimeSpan RetentionAfterExpiry = TimeSpan.FromDays(3);

        private readonly IPromoCodeRepository _promoCodes;
        private readonly ILogger<TarotMaintenanceService> _logger;

        public TarotMaintenanceService(IPromoCodeRepository promoCodes, ILogger<TarotMaintenanceService> logger)
        {
            _promoCodes = promoCodes;
            _logger = logger;
        }

        public async Task<long> PurgeExpiredCodesAsync()
        {
            var threshold = DateTime.UtcNow - RetentionAfterExpiry;
            var removed = await _promoCodes.DeleteExpiredByPrefixAsync(TarotCodePrefix, threshold);

            if (removed > 0)
            {
                _logger.LogInformation("Purged {Count} expired tarot promo codes.", removed);
            }

            return removed;
        }
    }
}
