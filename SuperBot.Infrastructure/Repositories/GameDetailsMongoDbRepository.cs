using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameDetailsMongoDbRepository : IGameDetailsRepository
    {
        private readonly IMongoCollection<GameDetailsDb> _details;
        private readonly IMapper _mapper;

        public GameDetailsMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _details = database.GetCollection<GameDetailsDb>("GameDetails");
        }

        public async Task<GameDetails> GetByGameIdAsync(string gameId)
        {
            if (string.IsNullOrWhiteSpace(gameId))
            {
                return null;
            }

            var detailsDb = await _details.Find(item => item.GameId == gameId).FirstOrDefaultAsync();
            return _mapper.Map<GameDetails>(detailsDb);
        }

        public async Task<GameDetails> GetBySlugAsync(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug))
            {
                return null;
            }

            var detailsDb = await _details.Find(item => item.Slug == slug).FirstOrDefaultAsync();
            return _mapper.Map<GameDetails>(detailsDb);
        }

        public async Task CreateAsync(GameDetails details)
        {
            var db = _mapper.Map<GameDetailsDb>(details);
            await _details.InsertOneAsync(db);
        }

        public async Task UpsertAsync(GameDetails details)
        {
            var db = _mapper.Map<GameDetailsDb>(details);
            var filter = Builders<GameDetailsDb>.Filter.Eq(item => item.GameId, details.GameId);
            await _details.ReplaceOneAsync(filter, db, new ReplaceOptions { IsUpsert = true });
        }

        public async Task UpdateAsync(string id, GameDetails details)
        {
            var db = _mapper.Map<GameDetailsDb>(details);
            await _details.ReplaceOneAsync(item => item.Id == id, db);
        }
    }
}
