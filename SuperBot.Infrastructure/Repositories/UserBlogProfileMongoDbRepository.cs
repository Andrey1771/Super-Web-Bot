using SuperBot.Infrastructure.Mapping;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using System.Linq;

namespace SuperBot.Infrastructure.Repositories
{
    public class UserBlogProfileMongoDbRepository : IUserBlogProfileRepository
    {
        private readonly IMongoCollection<UserBlogProfileDb> _profiles;
        private readonly IMapper _mapper;

        public UserBlogProfileMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _profiles = database.GetCollection<UserBlogProfileDb>("UserBlogProfiles");
        }

        public async Task<UserBlogProfile> GetByUserIdAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            var db = await _profiles.Find(item => item.UserId == userId).FirstOrDefaultAsync();
            return _mapper.Map<UserBlogProfile>(db);
        }

        public async Task<UserBlogProfile> GetByAnonIdAsync(string anonId)
        {
            if (string.IsNullOrWhiteSpace(anonId))
            {
                return null;
            }

            var db = await _profiles.Find(item => item.AnonId == anonId).FirstOrDefaultAsync();
            return _mapper.Map<UserBlogProfile>(db);
        }

        public async Task<UserBlogProfile> UpsertAsync(UserBlogProfile profile)
        {
            if (profile == null)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(profile.Id))
            {
                profile.Id = ObjectId.GenerateNewId().ToString();
            }

            var db = _mapper.Map<UserBlogProfileDb>(profile);

            if (!string.IsNullOrWhiteSpace(profile.UserId))
            {
                await UpsertWithRetryAsync(item => item.UserId == profile.UserId, db);
            }
            else if (!string.IsNullOrWhiteSpace(profile.AnonId))
            {
                await UpsertWithRetryAsync(item => item.AnonId == profile.AnonId, db);
            }
            else
            {
                await _profiles.InsertOneAsync(db);
            }

            return _mapper.Map<UserBlogProfile>(db);
        }

        /// <summary>
        /// Upsert, переживающий гонку.
        ///
        /// Лента новостей отправляет показы всех видимых постов разом — четыре-шесть запросов
        /// одновременно от одного посетителя. Все они не находят профиля, все пытаются его
        /// вставить, и уникальный индекс отклоняет всех, кроме первого: три показа из четырёх
        /// терялись с 500-й ошибкой.
        ///
        /// Повтор решает это без блокировок: к моменту второй попытки документ уже создан
        /// соседним запросом, и ReplaceOne просто заменит его.
        /// </summary>
        private async Task UpsertWithRetryAsync(
            System.Linq.Expressions.Expression<Func<UserBlogProfileDb, bool>> filter,
            UserBlogProfileDb document)
        {
            try
            {
                await _profiles.ReplaceOneAsync(filter, document, new ReplaceOptions { IsUpsert = true });
            }
            catch (MongoWriteException exception) when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                await _profiles.ReplaceOneAsync(filter, document, new ReplaceOptions { IsUpsert = true });
            }
        }

        public async Task<UserBlogProfile> MergeAnonIntoUserAsync(string anonId, string userId)
        {
            if (string.IsNullOrWhiteSpace(anonId) || string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            var anonProfile = await GetByAnonIdAsync(anonId);
            var userProfile = await GetByUserIdAsync(userId);

            if (anonProfile == null && userProfile == null)
            {
                return null;
            }

            if (userProfile == null)
            {
                anonProfile.UserId = userId;
                anonProfile.MergedFromAnonId = anonId;
                anonProfile.AnonId = null;
                return await UpsertAsync(anonProfile);
            }

            if (anonProfile != null)
            {
                foreach (var entry in anonProfile.TagWeights)
                {
                    if (!userProfile.TagWeights.ContainsKey(entry.Key))
                    {
                        userProfile.TagWeights[entry.Key] = 0;
                    }
                    userProfile.TagWeights[entry.Key] += entry.Value;
                }

                foreach (var entry in anonProfile.TopicWeights)
                {
                    if (!userProfile.TopicWeights.ContainsKey(entry.Key))
                    {
                        userProfile.TopicWeights[entry.Key] = 0;
                    }
                    userProfile.TopicWeights[entry.Key] += entry.Value;
                }

                var history = anonProfile.ReadingHistory.Concat(userProfile.ReadingHistory)
                    .OrderByDescending(item => item.Timestamp)
                    .Take(50)
                    .ToList();

                userProfile.ReadingHistory = history;
                userProfile.LastShown = anonProfile.LastShown.Concat(userProfile.LastShown)
                    .OrderByDescending(item => item.Timestamp)
                    .Take(50)
                    .ToList();
                userProfile.MergedFromAnonId = anonId;
                userProfile.UpdatedAt = DateTime.UtcNow;
            }

            return await UpsertAsync(userProfile);
        }
    }
}
