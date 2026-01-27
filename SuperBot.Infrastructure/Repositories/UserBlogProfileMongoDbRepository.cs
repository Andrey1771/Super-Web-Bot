using AutoMapper;
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
                await _profiles.ReplaceOneAsync(item => item.UserId == profile.UserId, db, new ReplaceOptions { IsUpsert = true });
            }
            else if (!string.IsNullOrWhiteSpace(profile.AnonId))
            {
                await _profiles.ReplaceOneAsync(item => item.AnonId == profile.AnonId, db, new ReplaceOptions { IsUpsert = true });
            }
            else
            {
                await _profiles.InsertOneAsync(db);
            }

            return _mapper.Map<UserBlogProfile>(db);
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
