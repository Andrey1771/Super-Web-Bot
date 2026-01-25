using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IMediaAssetRepository
    {
        Task<MediaAsset> GetByIdAsync(string id);
        Task<(IReadOnlyList<MediaAsset> Items, long Total)> ListAsync(string search, int page, int pageSize);
        Task CreateAsync(MediaAsset asset);
        Task DeleteAsync(string id);
    }
}
