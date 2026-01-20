using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class AccountSessionDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)]
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string SessionId { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public string UserAgent { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime LastSeenAt { get; set; }
    }
}
