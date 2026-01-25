using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IImportJobRepository
    {
        Task CreateAsync(ImportJob job);
        Task UpdateAsync(ImportJob job);
        Task<ImportJob> GetByIdAsync(string id);
        Task<IReadOnlyList<ImportJob>> GetRecentAsync(int limit);
    }
}
