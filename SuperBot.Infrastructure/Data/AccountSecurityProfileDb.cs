using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class AccountSecurityProfileDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)]
        public Guid Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool EmailVerified { get; set; }
        public bool IsTwoFactorEnabled { get; set; }
        public string TwoFactorSecret { get; set; } = string.Empty;
        public List<string> BackupCodesHash { get; set; } = new();
        public DateTime? BackupCodesGeneratedAt { get; set; }
        public DateTime MemberSince { get; set; }
        public DateTime? LastPasswordChangeAt { get; set; }
    }
}
