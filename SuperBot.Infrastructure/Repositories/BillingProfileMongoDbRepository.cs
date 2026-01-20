using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class BillingProfileMongoDbRepository : IBillingProfileRepository
    {
        private readonly IMongoCollection<BillingProfileDb> _billingProfiles;

        public BillingProfileMongoDbRepository(IMongoDatabase database)
        {
            _billingProfiles = database.GetCollection<BillingProfileDb>("BillingProfiles");
        }

        public async Task<BillingProfile> GetByUserIdAsync(string userId)
        {
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            var profile = await _billingProfiles.Find(item => item.UserId == userId).FirstOrDefaultAsync();
            return profile == null ? null : MapToEntity(profile);
        }

        public async Task UpsertAsync(BillingProfile profile)
        {
            if (profile == null || string.IsNullOrWhiteSpace(profile.UserId))
            {
                return;
            }

            var dbProfile = MapToDb(profile);
            await _billingProfiles.ReplaceOneAsync(item => item.UserId == profile.UserId, dbProfile, new ReplaceOptions
            {
                IsUpsert = true
            });
        }

        private static BillingProfile MapToEntity(BillingProfileDb profile)
        {
            return new BillingProfile
            {
                UserId = profile.UserId,
                StripeCustomerId = profile.StripeCustomerId,
                DisplayName = profile.DisplayName,
                Email = profile.Email,
                HideOwnedGamesInProfile = profile.HideOwnedGamesInProfile,
                DefaultPaymentMethodId = profile.DefaultPaymentMethodId,
                BillingDetails = profile.BillingDetails == null
                    ? null
                    : new BillingDetails
                    {
                        AddressLine1 = profile.BillingDetails.AddressLine1,
                        City = profile.BillingDetails.City,
                        PostalCode = profile.BillingDetails.PostalCode,
                        Country = profile.BillingDetails.Country,
                        Phone = profile.BillingDetails.Phone
                    }
            };
        }

        private static BillingProfileDb MapToDb(BillingProfile profile)
        {
            return new BillingProfileDb
            {
                UserId = profile.UserId,
                StripeCustomerId = profile.StripeCustomerId,
                DisplayName = profile.DisplayName,
                Email = profile.Email,
                HideOwnedGamesInProfile = profile.HideOwnedGamesInProfile,
                DefaultPaymentMethodId = profile.DefaultPaymentMethodId,
                BillingDetails = profile.BillingDetails == null
                    ? null
                    : new BillingDetailsDb
                    {
                        AddressLine1 = profile.BillingDetails.AddressLine1,
                        City = profile.BillingDetails.City,
                        PostalCode = profile.BillingDetails.PostalCode,
                        Country = profile.BillingDetails.Country,
                        Phone = profile.BillingDetails.Phone
                    }
            };
        }
    }
}
