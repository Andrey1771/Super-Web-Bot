using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface IPromoCodeUsageRepository
{
    Task<long> CountByPromoCodeIdAsync(string promoCodeId);
    Task<long> CountByPromoCodeAndUserAsync(string promoCodeId, string userName);
    Task RecordUsageAsync(PromoCodeUsage usage);
}
