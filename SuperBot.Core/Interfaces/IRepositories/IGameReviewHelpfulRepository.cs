namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameReviewHelpfulRepository
    {
        Task<bool> ToggleAsync(string reviewId, string userId);
    }
}
