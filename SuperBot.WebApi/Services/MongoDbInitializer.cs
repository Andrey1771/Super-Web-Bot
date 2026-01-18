using MongoDB.Driver;

namespace SuperBot.WebApi.Services
{
    public class MongoDbInitializer
    {
        private readonly IMongoDatabase _database;

        public MongoDbInitializer(IMongoDatabase database)
        {
            _database = database;
        }

        // Метод для инициализации коллекций
        public async Task InitializeAsync()
        {
            // Список коллекций, которые нужно проверить/создать
            var collectionsToEnsure = new[] { "Users", "Games", "Orders", "WishlistItems", "ViewedGames", "GameKeys" };

            var existingCollections = await _database.ListCollectionNamesAsync();

            // Проверяем наличие каждой коллекции, если нет — создаем
            var existingCollectionsList = await existingCollections.ToListAsync();
            foreach (var collectionName in collectionsToEnsure)
            {
                if (!existingCollectionsList.Contains(collectionName))
                {
                    await _database.CreateCollectionAsync(collectionName);
                }
            }

            var wishlistCollection = _database.GetCollection<SuperBot.Infrastructure.Data.WishlistItemDb>("WishlistItems");
            var wishlistIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.WishlistItemDb>(
                Builders<SuperBot.Infrastructure.Data.WishlistItemDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.GameId),
                new CreateIndexOptions { Unique = true, Name = "ix_wishlist_user_game" }
            );

            await wishlistCollection.Indexes.CreateOneAsync(wishlistIndex);

            var viewedCollection = _database.GetCollection<SuperBot.Infrastructure.Data.ViewedGameDb>("ViewedGames");
            var viewedUserGameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.ViewedGameDb>(
                Builders<SuperBot.Infrastructure.Data.ViewedGameDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.GameId),
                new CreateIndexOptions { Unique = true, Name = "ix_viewed_user_game" }
            );
            var viewedUserDateIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.ViewedGameDb>(
                Builders<SuperBot.Infrastructure.Data.ViewedGameDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.LastViewedAt),
                new CreateIndexOptions { Name = "ix_viewed_user_last_viewed" }
            );

            await viewedCollection.Indexes.CreateOneAsync(viewedUserGameIndex);
            await viewedCollection.Indexes.CreateOneAsync(viewedUserDateIndex);

            var gameKeyCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameKeyDb>("GameKeys");
            var gameKeyUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.IssuedAt),
                new CreateIndexOptions { Name = "ix_game_keys_user_issued" }
            );
            await gameKeyCollection.Indexes.CreateOneAsync(gameKeyUserIndex);
        }
    }
}
