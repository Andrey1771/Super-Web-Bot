using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class UserBlogProfileDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("anonId")]
        public string AnonId { get; set; }

        [BsonElement("tagWeights")]
        public Dictionary<string, double> TagWeights { get; set; } = new();

        [BsonElement("topicWeights")]
        public Dictionary<string, double> TopicWeights { get; set; } = new();

        [BsonElement("readingHistory")]
        public List<BlogReadingHistoryItemDb> ReadingHistory { get; set; } = new();

        [BsonElement("lastShown")]
        public List<BlogShownItemDb> LastShown { get; set; } = new();

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [BsonElement("mergedFromAnonId")]
        public string MergedFromAnonId { get; set; }
    }

    public class BlogReadingHistoryItemDb
    {
        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("ts")]
        public DateTime Timestamp { get; set; }

        [BsonElement("progress")]
        public double Progress { get; set; }

        [BsonElement("dwellMs")]
        public int DwellMs { get; set; }
    }

    public class BlogShownItemDb
    {
        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("ts")]
        public DateTime Timestamp { get; set; }
    }
}
