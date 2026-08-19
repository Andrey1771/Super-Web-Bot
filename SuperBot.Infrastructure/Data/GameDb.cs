using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;
using SuperBot.Core.Entities;

namespace SuperBot.Infrastructure.Data
{
    public class GameDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("name")]
        public string Name { get; set; }

        [BsonElement("externalId")]
        public string ExternalId { get; set; }

        [BsonElement("slug")]
        public string Slug { get; set; }

        [BsonElement("price")]
        public decimal Price { get; set; }

        /// <summary>Валюта базовой цены. Пусто у записей до мультивалютности — читается как USD.</summary>
        [BsonElement("currency")]
        [BsonIgnoreIfNull]
        public string? Currency { get; set; }

        [BsonElement("lowStockThreshold")]
        [BsonIgnoreIfNull]
        public int? LowStockThreshold { get; set; }

        /// <summary>Ручные цены в других валютах. Базовой валюты здесь нет — она в price.</summary>
        [BsonElement("prices")]
        [BsonIgnoreIfNull]
        public Dictionary<string, decimal>? Prices { get; set; }

        [BsonElement("description")]
        public string Description { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("gameType")]
        public GameType GameType { get; set; }

        [BsonElement("imagePath")]
        public string ImagePath { get; set; }

        [BsonElement("coverMediaId")]
        public string CoverMediaId { get; set; }

        [BsonElement("releaseDate")]
        public DateTime ReleaseDate { get; set; }
    }
}
