using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IAccountSessionRepository
    {
        Task<List<AccountSession>> GetByUserAsync(string userId);
        Task<AccountSession?> GetBySessionIdAsync(string userId, string sessionId);
        Task<AccountSession> UpsertAsync(AccountSession session);
        Task RevokeAsync(string userId, string sessionId);
        Task RevokeAllAsync(string userId, string? sessionToKeep);
    }
}
