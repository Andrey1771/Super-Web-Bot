using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;

namespace SuperBot.Infrastructure.Data
{
    public class CartItemDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; } // Уникальный идентификатор (для MongoDB)

        public string UserEmail { get; set; } // Уникальная почта, принадлежащая пользователю

        [BsonRepresentation(BsonType.ObjectId)]
        public string GameId { get; set; } // GameId, которому принадлежит товар

        public string UserId { get; set; } // Идентификатор пользователя (анонимный или зарегистрированный)

        public string Name { get; set; } // Название товара

        public decimal Price { get; set; } // Цена товара

        public int Quantity { get; set; } // Количество

        public string Image { get; set; } // URL изображения
    }
}
