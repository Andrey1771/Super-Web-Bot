using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IMediaAssetRepository
    {
        Task<MediaAsset> GetByIdAsync(string id);
        Task<MediaAsset> GetByHashAsync(string hash, long sizeBytes);
        Task<(IReadOnlyList<MediaAsset> Items, long Total)> ListAsync(string search, int page, int pageSize, string type = null);
        Task CreateAsync(MediaAsset asset);
        Task UpdateAsync(string id, MediaAsset asset);
        Task DeleteAsync(string id);
    }
}
