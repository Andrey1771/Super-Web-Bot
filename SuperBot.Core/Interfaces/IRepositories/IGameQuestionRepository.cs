using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public interface IGameQuestionRepository
    {
        Task<List<GameQuestion>> GetByGameIdAsync(string gameId, int limit = 20);
        Task AddQuestionAsync(GameQuestion question);
        Task AddAnswerAsync(string questionId, GameAnswer answer);
    }
}
