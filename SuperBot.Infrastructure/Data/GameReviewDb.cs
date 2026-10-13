using System;
using System.Collections.Generic;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    // Все существующие отзывы записаны с полем avatarUrl (всегда null: заполнять его было
    // некому). В классе его больше нет — аватар берётся из профиля в момент показа, — а без
    // этого атрибута драйвер валил бы десериализацию на каждом старом документе. Поле
    // подчищает миграция DropReviewAvatarFieldAsync, но порядок «сначала код, потом чистка»
    // не должен ронять чтение.
    [BsonIgnoreExtraElements]
    public class GameReviewDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("gameId")]
        public string GameId { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("userName")]
        public string UserName { get; set; }

        // Поля avatarUrl здесь больше нет: его никто никогда не заполнял (в коллекции не
        // нашлось ни одного документа с ним), а витрина берёт аватар из профиля в момент
        // показа — см. Services/UserAvatars.

        [BsonElement("verifiedPurchase")]
        public bool VerifiedPurchase { get; set; }

        [BsonElement("buyerKey")]
        [BsonIgnoreIfNull]
        public string? BuyerKey { get; set; }

        [BsonElement("refunded")]
        public bool Refunded { get; set; }

        [BsonElement("rating")]
        public int Rating { get; set; }

        [BsonElement("playtimeHours")]
        public double? PlaytimeHours { get; set; }

        [BsonElement("text")]
        public string Text { get; set; }

        [BsonElement("images")]
        public List<ReviewImageDb> Images { get; set; } = new();

        [BsonElement("recommend")]
        public bool Recommend { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        [BsonElement("editedAt")]
        [BsonIgnoreIfNull]
        public DateTime? EditedAt { get; set; }

        [BsonElement("revisions")]
        [BsonIgnoreIfNull]
        public List<ReviewRevisionDb>? Revisions { get; set; }

        [BsonElement("helpfulCount")]
        public int HelpfulCount { get; set; }

        [BsonElement("status")]
        public string Status { get; set; }
        [BsonElement("reportCount")]
        public int ReportCount { get; set; }
        [BsonElement("lastReportedAt")]
        public DateTime? LastReportedAt { get; set; }
        // Ответов магазина под отзывами нет; старое поле shopReply в документах игнорируется
        // ([BsonIgnoreExtraElements]) и при следующей записи отзыва пропадает.
    }

    public class ReviewRevisionDb
    {
        [BsonElement("text")]
        public string Text { get; set; } = string.Empty;
        [BsonElement("rating")]
        public int Rating { get; set; }
        [BsonElement("playtimeHours")]
        [BsonIgnoreIfNull]
        public double? PlaytimeHours { get; set; }
        [BsonElement("replacedAt")]
        public DateTime ReplacedAt { get; set; }
        [BsonElement("underReport")]
        public bool UnderReport { get; set; }
    }

    public class ReviewImageDb
    {
        [BsonElement("url")]
        public string Url { get; set; }

        [BsonElement("thumbUrl")]
        public string ThumbUrl { get; set; }
    }
}
