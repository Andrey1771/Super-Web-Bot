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

        [BsonElement("lowStockFromUtc")]
        [BsonIgnoreIfNull]
        public DateTime? LowStockFromUtc { get; set; }

        /// <summary>Для DLC — id базовой игры; у обычных игр поля нет.</summary>
        [BsonElement("parentGameId")]
        [BsonIgnoreIfNull]
        public string? ParentGameId { get; set; }

        [BsonElement("regionPolicy")]
        [BsonIgnoreIfNull]
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }

        /// <summary>Цены региональных вариантов. Пусто — вариантных цен нет, продаём по цене игры.</summary>
        [BsonElement("regionPrices")]
        [BsonIgnoreIfNull]
        public List<SuperBot.Core.Regions.RegionPrice>? RegionPrices { get; set; }

        /// <summary>Ручные цены в других валютах. Базовой валюты здесь нет — она в price.</summary>
        [BsonElement("prices")]
        [BsonIgnoreIfNull]
        public Dictionary<string, decimal>? Prices { get; set; }

        [BsonElement("description")]
        public string Description { get; set; }

        [BsonElement("descriptionI18n")]
        [BsonIgnoreIfNull]
        public Dictionary<string, string>? DescriptionI18n { get; set; }

        [BsonElement("title")]
        public string Title { get; set; }

        [BsonElement("gameType")]
        public GameType GameType { get; set; }

        /// <summary>Tag жанра из настроек. Нет поля — документ до переезда: жанр выводится из gameType (миграция проставляет).</summary>
        [BsonElement("genre")]
        [BsonIgnoreIfNull]
        public string? Genre { get; set; }

        /// <summary>Вид товара строкой ("Game" / "Software"). Нет поля — игра: миграция не нужна.</summary>
        [BsonElement("kind")]
        [BsonRepresentation(BsonType.String)]
        public ProductKind Kind { get; set; } = ProductKind.Game;

        [BsonElement("softwareCategory")]
        [BsonIgnoreIfNull]
        public string? SoftwareCategory { get; set; }

        [BsonElement("imagePath")]
        public string ImagePath { get; set; }

        [BsonElement("coverMediaId")]
        public string CoverMediaId { get; set; }

        [BsonElement("releaseDate")]
        public DateTime ReleaseDate { get; set; }
    }
}
