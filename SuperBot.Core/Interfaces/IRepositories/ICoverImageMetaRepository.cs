using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ICoverImageMetaRepository
    {
        Task<CoverImageMeta?> GetAsync(string path, CancellationToken ct = default);
        Task UpsertAsync(CoverImageMeta meta, CancellationToken ct = default);
        /// <summary>Основные цвета обложек одним запросом: путь → #rrggbb. Обложек без цвета в ответе нет.</summary>
        Task<IReadOnlyDictionary<string, string>> GetColorsAsync(IEnumerable<string> paths, CancellationToken ct = default);
    }
}
