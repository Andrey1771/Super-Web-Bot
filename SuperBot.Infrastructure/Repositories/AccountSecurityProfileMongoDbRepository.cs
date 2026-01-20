using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class AccountSecurityProfileMongoDbRepository : IAccountSecurityProfileRepository
    {
        private readonly IMongoCollection<AccountSecurityProfileDb> _collection;

        public AccountSecurityProfileMongoDbRepository(IMongoDatabase database)
        {
            _collection = database.GetCollection<AccountSecurityProfileDb>("AccountSecurityProfiles");
        }

        public async Task<AccountSecurityProfile?> GetByUserIdAsync(string userId)
        {
            var profileDb = await _collection.Find(item => item.UserId == userId).FirstOrDefaultAsync();
            return profileDb == null ? null : MapToEntity(profileDb);
        }

        public async Task<AccountSecurityProfile> UpsertAsync(AccountSecurityProfile profile)
        {
            var profileDb = MapToDb(profile);
            await _collection.ReplaceOneAsync(
                item => item.UserId == profileDb.UserId,
                profileDb,
                new ReplaceOptions { IsUpsert = true }
            );
            return MapToEntity(profileDb);
        }

        private static AccountSecurityProfile MapToEntity(AccountSecurityProfileDb db) =>
            new()
            {
                Id = db.Id,
                UserId = db.UserId,
                Email = db.Email,
                EmailVerified = db.EmailVerified,
                IsTwoFactorEnabled = db.IsTwoFactorEnabled,
                TwoFactorSecret = db.TwoFactorSecret,
                BackupCodesHash = db.BackupCodesHash ?? new List<string>(),
                BackupCodesGeneratedAt = db.BackupCodesGeneratedAt,
                MemberSince = db.MemberSince,
                LastPasswordChangeAt = db.LastPasswordChangeAt
            };

        private static AccountSecurityProfileDb MapToDb(AccountSecurityProfile profile) =>
            new()
            {
                Id = profile.Id == Guid.Empty ? Guid.NewGuid() : profile.Id,
                UserId = profile.UserId,
                Email = profile.Email,
                EmailVerified = profile.EmailVerified,
                IsTwoFactorEnabled = profile.IsTwoFactorEnabled,
                TwoFactorSecret = profile.TwoFactorSecret,
                BackupCodesHash = profile.BackupCodesHash ?? new List<string>(),
                BackupCodesGeneratedAt = profile.BackupCodesGeneratedAt,
                MemberSince = profile.MemberSince,
                LastPasswordChangeAt = profile.LastPasswordChangeAt
            };
    }
}
