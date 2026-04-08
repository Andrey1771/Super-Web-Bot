using AutoMapper;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BlogViewSettingsMongoDbRepository : IBlogViewSettingsRepository
    {
        private readonly IMongoCollection<BlogViewSettingsDb> _settings;
        private readonly IMapper _mapper;

        public BlogViewSettingsMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _settings = database.GetCollection<BlogViewSettingsDb>("BlogViewSettings");
        }

        public async Task<BlogViewSettings> GetAsync()
        {
            var settings = await _settings.Find(_ => true).FirstOrDefaultAsync();
            return _mapper.Map<BlogViewSettings>(settings) ?? new BlogViewSettings();
        }

        public async Task<BlogViewSettings> UpsertAsync(BlogViewSettings settings)
        {
            var db = _mapper.Map<BlogViewSettingsDb>(settings);
            var existing = await _settings.Find(_ => true).FirstOrDefaultAsync();
            if (existing != null)
            {
                db.Id = existing.Id;
            }
            else if (string.IsNullOrWhiteSpace(db.Id) || !ObjectId.TryParse(db.Id, out _))
            {
                db.Id = ObjectId.GenerateNewId().ToString();
            }

            await _settings.ReplaceOneAsync(item => item.Id == db.Id, db, new ReplaceOptions { IsUpsert = true });
            return _mapper.Map<BlogViewSettings>(db);
        }
    }
}
