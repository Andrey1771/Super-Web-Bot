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
}
