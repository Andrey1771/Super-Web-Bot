namespace SuperBot.Core.Entities
{
    public class Wishlist
    {
        public string UserId { get; set; }

        public WishlistGame[] WishlistGames { get; set; }
    }

    public class WishlistGame
    {
        public string GameId { get; set; }

        public string Name { get; set; }

        public decimal Price { get; set; }

        public string Image { get; set; }
    }
}
