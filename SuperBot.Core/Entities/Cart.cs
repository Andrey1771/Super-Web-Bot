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

        /// <summary>Издание, если у игры их несколько. Пусто — базовое.</summary>
        public string? EditionCode { get; set; }

        public string? EditionTitle { get; set; }

        /// <summary>
        /// Региональный вариант ключа. Хранится вместе с позицией, потому что он определяет и цену,
        /// и то, из какой партии придёт ключ: потерять его при синхронизации значит подменить товар.
        /// </summary>
        public string? OfferKey { get; set; }

        public string? OfferTitle { get; set; }
    }
}
