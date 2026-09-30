using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface IPromoCodeUsageRepository
{
    Task<long> CountByPromoCodeIdAsync(string promoCodeId);
    Task<long> CountByPromoCodeAndUserAsync(string promoCodeId, string userName);
    Task RecordUsageAsync(PromoCodeUsage usage);

    /// <summary>Пишет использование; false — для этого заказа и кода запись уже есть.</summary>
    Task<bool> TryRecordUsageAsync(PromoCodeUsage usage);
}
