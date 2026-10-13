using Xunit;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Все интеграционные тесты живут в ОДНОЙ коллекции — значит на всю сборку поднимается
/// один экземпляр приложения и один эфемерный mongod, а классы идут последовательно.
///
/// Это не оптимизация, а необходимость: с IClassFixture каждый класс поднимал свой mongod,
/// xUnit гонял классы параллельно, и экземпляры конфликтовали — тесты падали с
/// «TimeoutException: A timeout occurred after 30000ms selecting a server».
/// </summary>
[CollectionDefinition(Name)]
public class IntegrationTestCollection : ICollectionFixture<TaleShopApiFactory>
{
    public const string Name = "taleshop-integration";
}
