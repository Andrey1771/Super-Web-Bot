using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IUserBlogProfileRepository
    {
        Task<UserBlogProfile> GetByUserIdAsync(string userId);
        Task<UserBlogProfile> GetByAnonIdAsync(string anonId);
        Task<UserBlogProfile> UpsertAsync(UserBlogProfile profile);
        Task<UserBlogProfile> MergeAnonIntoUserAsync(string anonId, string userId);
    }
}
