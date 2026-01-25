using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class MediaAssetDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("url")]
        public string Url { get; set; }

        [BsonElement("filename")]
        public string Filename { get; set; }

        [BsonElement("contentType")]
        public string ContentType { get; set; }

        [BsonElement("sizeBytes")]
        public long SizeBytes { get; set; }

        [BsonElement("width")]
        public int? Width { get; set; }

        [BsonElement("height")]
        public int? Height { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("tags")]
        public string[] Tags { get; set; }
    }
}
