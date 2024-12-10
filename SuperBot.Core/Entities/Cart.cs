namespace SuperBot.Core.Entities
{
    public class Cart
    {
        public string UserId { get; set; } // Идентификатор пользователя (анонимный или зарегистрированный)

        public CartGame[] CartGames { get; set; }
    }

    public class CartGame
    {
        public string GameId { get; set; } // GameId, которому принадлежит товар

        public string Name { get; set; } // Название товара

        public decimal Price { get; set; } // Цена товара

        public int Quantity { get; set; } // Количество

        public string Image { get; set; } // URL изображения
    }
}
