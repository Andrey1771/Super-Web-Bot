using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IMediaAssetRepository
    {
        Task<MediaAsset> GetByIdAsync(string id);

        /// <summary>
        /// Пачкой по списку идентификаторов — для каталога, где обложек десятки.
        /// Поштучный запрос в цикле давал по походу в базу на каждую игру.
        /// </summary>
        Task<IReadOnlyList<MediaAsset>> GetByIdsAsync(IEnumerable<string> ids);
        Task<MediaAsset> GetByHashAsync(string hash, long sizeBytes);
        Task<(IReadOnlyList<MediaAsset> Items, long Total)> ListAsync(string search, int page, int pageSize, string type = null);
        Task CreateAsync(MediaAsset asset);
        Task UpdateAsync(string id, MediaAsset asset);
        Task UpdateDimensionsAsync(string id, int width, int height);
        Task DeleteAsync(string id);
    }
}
