using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameQuestionMongoDbRepository : IGameQuestionRepository
    {
        private readonly IMongoCollection<GameQuestionDb> _questions;

        public GameQuestionMongoDbRepository(IMongoDatabase database)
        {
            _questions = database.GetCollection<GameQuestionDb>("GameQuestions");
        }

        public async Task<List<GameQuestion>> GetByGameIdAsync(string gameId, int limit = 20)
        {
            var items = await _questions.Find(item => item.GameId == gameId)
                .SortByDescending(item => item.CreatedAt)
                .Limit(limit)
                .ToListAsync();

            return items.Select(MapToEntity).ToList();
        }

        public async Task AddQuestionAsync(GameQuestion question)
        {
            var db = MapToDb(question);
            await _questions.InsertOneAsync(db);
            question.Id = db.Id;
        }

        public async Task AddAnswerAsync(string questionId, GameAnswer answer)
        {
            var dbAnswer = new GameAnswerDb
            {
                Id = answer.Id,
                UserId = answer.UserId,
                UserName = answer.UserName,
                Text = answer.Text,
                CreatedAt = answer.CreatedAt,
                IsOfficial = answer.IsOfficial
            };

            var update = Builders<GameQuestionDb>.Update.Push(item => item.Answers, dbAnswer);
            await _questions.UpdateOneAsync(item => item.Id == questionId, update);
        }

        private static GameQuestion MapToEntity(GameQuestionDb db)
        {
            if (db == null)
            {
                return null;
            }

            return new GameQuestion
            {
                Id = db.Id,
                GameId = db.GameId,
                UserId = db.UserId,
                UserName = db.UserName,
                Question = db.Question,
                CreatedAt = db.CreatedAt,
                Answers = db.Answers?.Select(answer => new GameAnswer
                {
                    Id = answer.Id,
                    UserId = answer.UserId,
                    UserName = answer.UserName,
                    Text = answer.Text,
                    CreatedAt = answer.CreatedAt,
                IsOfficial = answer.IsOfficial
                }).ToList() ?? new List<GameAnswer>()
            };
        }

        private static GameQuestionDb MapToDb(GameQuestion question)
        {
            return new GameQuestionDb
            {
                Id = question.Id,
                GameId = question.GameId,
                UserId = question.UserId,
                UserName = question.UserName,
                Question = question.Question,
                CreatedAt = question.CreatedAt,
                Answers = question.Answers?.Select(answer => new GameAnswerDb
                {
                    Id = answer.Id,
                    UserId = answer.UserId,
                    UserName = answer.UserName,
                    Text = answer.Text,
                    CreatedAt = answer.CreatedAt,
                IsOfficial = answer.IsOfficial
                }).ToList() ?? new List<GameAnswerDb>()
            };
        }
    }
}
