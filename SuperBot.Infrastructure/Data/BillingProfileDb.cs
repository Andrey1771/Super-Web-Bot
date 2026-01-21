using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class BillingProfileDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)]
        public string UserId { get; set; }

        public string StripeCustomerId { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public BillingDetailsDb BillingDetails { get; set; }
        public bool HideOwnedGamesInProfile { get; set; }
        public string DefaultPaymentMethodId { get; set; }
    }

    public class BillingDetailsDb
    {
        public string AddressLine1 { get; set; }
        public string City { get; set; }
        public string PostalCode { get; set; }
        public string Country { get; set; }
        public string Phone { get; set; }
    }
}
