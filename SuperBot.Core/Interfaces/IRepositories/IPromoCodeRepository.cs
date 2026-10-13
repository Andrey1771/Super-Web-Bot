using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories;

public interface IPromoCodeRepository
{
    Task<List<PromoCode>> GetAllAsync();
    Task<PromoCode?> GetByIdAsync(string id);
    Task<PromoCode?> GetByCodeAsync(string code);
    Task<PromoCode> CreateAsync(PromoCode promoCode);
    Task UpdateAsync(PromoCode promoCode);
    Task DeleteAsync(string id);

    /// <summary>
    /// Удаляет протухшие коды с заданным префиксом. Нужно для автовыдаваемых кодов
    /// (карта удачи), которые иначе копятся в админ-списке навсегда.
    /// Возвращает количество удалённых.
    /// </summary>
    Task<long> DeleteExpiredByPrefixAsync(string codePrefix, DateTime expiredBeforeUtc);
}
