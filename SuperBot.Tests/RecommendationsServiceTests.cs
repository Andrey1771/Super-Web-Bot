using Microsoft.Extensions.Logging.Abstractions;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

namespace SuperBot.Tests
{
    public class RecommendationsServiceTests
    {
        [Fact]
        public async Task RanksWishlistTypesAheadOfViewed()
        {
            var games = new List<Game>
            {
                new Game { Id = "wish", Title = "Wishlisted", Name = "Wishlisted", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddMonths(-6) },
                new Game { Id = "view", Title = "Viewed", Name = "Viewed", GameType = GameType.Adventure, ReleaseDate = DateTime.UtcNow.AddMonths(-12) },
                new Game { Id = "cand-action", Title = "Action Candidate", Name = "Action Candidate", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddMonths(-1) },
                new Game { Id = "cand-adv", Title = "Adventure Candidate", Name = "Adventure Candidate", GameType = GameType.Adventure, ReleaseDate = DateTime.UtcNow.AddMonths(-1) }
            };

            var wishlistRepository = new TestWishlistRepository(new HashSet<string> { "wish" });
            var viewedRepository = new TestViewedRepository(new List<ViewedGame>
            {
                new ViewedGame { GameId = "view", LastViewedAt = DateTime.UtcNow.AddDays(-2), ViewCount = 1 }
            });
            var orderRepository = new TestOrderRepository();
            var gameRepository = new TestGameRepository(games);

            var service = new RecommendationsService(
                gameRepository,
                wishlistRepository,
                viewedRepository,
                orderRepository,
                NullLogger<RecommendationsService>.Instance);

            var recommendations = await service.GetRecommendationsAsync("user", 2);

            Assert.Equal("cand-action", recommendations.First().Game.Id);
            Assert.DoesNotContain(recommendations, item => item.Game.Id == "wish");
            Assert.DoesNotContain(recommendations, item => item.Game.Id == "view");
        }

        [Fact]
        public async Task FiltersWishlistAndPurchasedGames()
        {
            var games = new List<Game>
            {
                new Game { Id = "wish", Title = "Wishlisted", Name = "Wishlisted", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddMonths(-2) },
                new Game { Id = "purchased", Title = "Purchased", Name = "Purchased", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddMonths(-3) },
                new Game { Id = "candidate", Title = "Candidate", Name = "Candidate", GameType = GameType.Action, ReleaseDate = DateTime.UtcNow.AddMonths(-1) }
            };

            var wishlistRepository = new TestWishlistRepository(new HashSet<string> { "wish" });
            var viewedRepository = new TestViewedRepository(new List<ViewedGame>
            {
                new ViewedGame { GameId = "wish", LastViewedAt = DateTime.UtcNow.AddDays(-2), ViewCount = 1 }
            });
            var orderRepository = new TestOrderRepository(new List<Order>
            {
                new Order { GameId = "purchased", UserName = "user" }
            });
            var gameRepository = new TestGameRepository(games);

            var service = new RecommendationsService(
                gameRepository,
                wishlistRepository,
                viewedRepository,
                orderRepository,
                NullLogger<RecommendationsService>.Instance);

            var recommendations = await service.GetRecommendationsAsync("user", 3);

            Assert.Single(recommendations);
            Assert.Equal("candidate", recommendations[0].Game.Id);
        }

        private class TestGameRepository : IGameRepository
        {
            private readonly List<Game> _games;

            public TestGameRepository(List<Game> games)
            {
                _games = games;
            }

            public Task<List<Game>> GetAllAsync() => Task.FromResult(_games);

            public Task<Game> GetByIdAsync(string id) => Task.FromResult(_games.FirstOrDefault(game => game.Id == id));

            public Task<List<Game>> GetByIdsAsync(IEnumerable<string> ids)
            {
                var idSet = ids.ToHashSet();
                return Task.FromResult(_games.Where(game => idSet.Contains(game.Id)).ToList());
            }

            public Task CreateAsync(Game game) => Task.CompletedTask;

            public Task UpdateAsync(string id, Game updatedGame) => Task.CompletedTask;
        }

        private class TestWishlistRepository : IWishlistRepository
        {
            private readonly HashSet<string> _ids;

            public TestWishlistRepository(HashSet<string> ids)
            {
                _ids = ids;
            }

            public Task<HashSet<string>> GetGameIdsAsync(string userId) => Task.FromResult(_ids);

            public Task AddAsync(string userId, string gameId) => Task.CompletedTask;

            public Task RemoveAsync(string userId, string gameId) => Task.CompletedTask;

            public Task<HashSet<string>> MergeAsync(string userId, IEnumerable<string> guestIds) => Task.FromResult(_ids);
        }

        private class TestViewedRepository : IViewedGameRepository
        {
            private readonly List<ViewedGame> _viewed;

            public TestViewedRepository(List<ViewedGame> viewed)
            {
                _viewed = viewed;
            }

            public Task<List<ViewedGame>> GetRecentAsync(string userId, int limit) => Task.FromResult(_viewed.Take(limit).ToList());

            public Task UpsertAsync(string userId, string gameId, string source = null) => Task.CompletedTask;
        }

        private class TestOrderRepository : IOrderRepository
        {
            private readonly List<Order> _orders;

            public TestOrderRepository(List<Order> orders = null)
            {
                _orders = orders ?? new List<Order>();
            }

            public Task CreateOrderAsync(Order order) => Task.CompletedTask;

            public Task<Order> GetOrderByIdAsync(string orderId) => Task.FromResult(_orders.FirstOrDefault());

            public Task<IEnumerable<Order>> GetAllOrdersAsync() => Task.FromResult<IEnumerable<Order>>(_orders);

            public Task<List<Order>> GetOrdersByUserAsync(string userName) => Task.FromResult(_orders.Where(order => order.UserName == userName).ToList());

            public Task UpdateOrderAsync(Order order) => Task.CompletedTask;

            public Task DeleteOrderAsync(string orderId) => Task.CompletedTask;
        }
    }
}
