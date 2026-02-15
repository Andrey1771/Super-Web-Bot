using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogPostDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("slug")]
        public string Slug { get; set; }

        [BsonElement("externalId")]
        public string ExternalId { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("excerpt")]
        public string Excerpt { get; set; }

        [BsonElement("coverAssetId")]
        public string CoverAssetId { get; set; }

        [BsonElement("coverUrl")]
        public string CoverUrl { get; set; }

        [BsonElement("status")]
        public string Status { get; set; }

        [BsonElement("publishedAt")]
        public DateTime? PublishedAt { get; set; }

        [BsonElement("scheduledAt")]
        public DateTime? ScheduledAt { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [BsonElement("authorId")]
        public string AuthorId { get; set; }

        [BsonElement("authorName")]
        public string AuthorName { get; set; }

        [BsonElement("tags")]
        public string[] Tags { get; set; }

        [BsonElement("topics")]
        public string[] Topics { get; set; }

        [BsonElement("readingTime")]
        public int? ReadingTime { get; set; }

        [BsonElement("currentVersionId")]
        public string CurrentVersionId { get; set; }

        [BsonElement("viewCount")]
        public int? ViewCount { get; set; }

        [BsonElement("editorScore")]
        public int? EditorScore { get; set; }

        [BsonElement("is_featured")]
        public bool Featured { get; set; }

        [BsonElement("is_main_featured")]
        public bool MainFeatured { get; set; }
    }
}
