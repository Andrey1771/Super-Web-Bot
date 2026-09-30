using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface ICoverImageMetaRepository
    {
        Task<CoverImageMeta?> GetAsync(string path, CancellationToken ct = default);
        Task UpsertAsync(CoverImageMeta meta, CancellationToken ct = default);
    }
}
