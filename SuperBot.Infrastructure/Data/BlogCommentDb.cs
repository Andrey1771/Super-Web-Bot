using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogCommentDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("anonId")]
        public string AnonId { get; set; }

        [BsonElement("authorName")]
        public string AuthorName { get; set; }

        [BsonElement("text")]
        public string Text { get; set; }

        [BsonElement("status")]
        public string Status { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}
