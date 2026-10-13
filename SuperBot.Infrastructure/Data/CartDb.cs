using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class CartDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; } // Уникальный идентификатор (для MongoDB)

        [BsonElement("userId")]
        public string UserId { get; set; } // Идентификатор пользователя (анонимный или зарегистрированный)
        [BsonElement("cartGames")]
        public CartGameDb[] CartGames { get; set; } // Название товара

        /// <summary>
        /// Когда корзину меняли в последний раз. Без этой отметки нельзя отличить корзину,
        /// собранную минуту назад, от брошенной неделю назад: у документа менялось содержимое,
        /// а _id хранит только момент создания.
        /// Необязательно — у корзин, заведённых до появления поля, его нет.
        /// </summary>
        [BsonElement("updatedAt")]
        [BsonIgnoreIfNull]
        public DateTime? UpdatedAt { get; set; }
    }

    public class CartGameDb
    {
        [BsonRepresentation(BsonType.ObjectId)]
        [BsonElement("gameId")]
        public string GameId { get; set; } // GameId, которому принадлежит товар
        [BsonElement("name")]
        public string Name { get; set; } // Название товара
        [BsonElement("price")]
        public decimal Price { get; set; } // Цена товара
        [BsonElement("quantity")]
        public int Quantity { get; set; } // Количество
        [BsonElement("image")]
        public string Image { get; set; } // URL изображения
        [BsonElement("editionCode")]
        public string? EditionCode { get; set; }
        [BsonElement("editionTitle")]
        public string? EditionTitle { get; set; }
        [BsonElement("offerKey")]
        public string? OfferKey { get; set; }
        [BsonElement("offerTitle")]
        public string? OfferTitle { get; set; }
    }
}
