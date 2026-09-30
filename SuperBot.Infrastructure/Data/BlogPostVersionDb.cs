using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class BlogPostVersionDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("postId")]
        public string PostId { get; set; }

        [BsonElement("versionNumber")]
        public int VersionNumber { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("excerpt")]
        public string Excerpt { get; set; }

        [BsonElement("contentMarkdown")]
        public string ContentMarkdown { get; set; }

        [BsonElement("contentHtml")]
        public string ContentHtml { get; set; }

        [BsonElement("titleI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? TitleI18n { get; set; }

        [BsonElement("excerptI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? ExcerptI18n { get; set; }

        [BsonElement("contentMarkdownI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? ContentMarkdownI18n { get; set; }

        [BsonElement("contentHtmlI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? ContentHtmlI18n { get; set; }

        [BsonElement("coverAssetId")]
        public string CoverAssetId { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("createdBy")]
        public string CreatedBy { get; set; }

        [BsonElement("changeNote")]
        public string ChangeNote { get; set; }
    }
}
