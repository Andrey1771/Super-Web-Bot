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
            var collectionsToEnsure = new[] { "Users", "Games", "Orders", "Wishlist" };

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
        }
    }
}
