using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System;
using System.Diagnostics;
using System.Linq;

namespace SuperBot.Core.Services
{
    public class RecommendationsService : IRecommendationsService
    {
        private readonly IGameRepository _gameRepository;
        private readonly IWishlistRepository _wishlistRepository;
        private readonly IViewedGameRepository _viewedGameRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly ILogger<RecommendationsService> _logger;

        public RecommendationsService(
            IGameRepository gameRepository,
            IWishlistRepository wishlistRepository,
            IViewedGameRepository viewedGameRepository,
            IOrderRepository orderRepository,
            ILogger<RecommendationsService> logger)
        {
            _gameRepository = gameRepository;
            _wishlistRepository = wishlistRepository;
            _viewedGameRepository = viewedGameRepository;
            _orderRepository = orderRepository;
            _logger = logger;
        }

        public async Task<IReadOnlyList<RecommendationItem>> GetRecommendationsAsync(string userId, int limit)
        {
            var stopwatch = Stopwatch.StartNew();
            var normalizedLimit = Math.Clamp(limit, 1, 50);
            var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);
            var viewed = await _viewedGameRepository.GetRecentAsync(userId, 50);

            var purchasedIds = await GetPurchasedGameIdsAsync(userId);

            var excludeIds = new HashSet<string>(wishlistIds ?? new HashSet<string>());
            foreach (var purchasedId in purchasedIds)
            {
                excludeIds.Add(purchasedId);
            }

            var allGames = await _gameRepository.GetAllAsync();
            if (!wishlistIds.Any() && viewed.Count == 0)
            {
                var fallback = BuildFallbackRecommendations(allGames, excludeIds, normalizedLimit);
                LogResult(userId, wishlistIds.Count, viewed.Count, fallback.Count, stopwatch);
                return fallback;
            }

            var preferenceWeights = new Dictionary<GameType, double>();
            var reasonByType = new Dictionary<GameType, string>();
            var wishlistGames = await _gameRepository.GetByIdsAsync(wishlistIds);

            foreach (var game in wishlistGames)
            {
                AddWeight(preferenceWeights, game.GameType, 3.0);
                if (!reasonByType.ContainsKey(game.GameType))
                {
                    reasonByType[game.GameType] = $"Because you wishlisted: {GetGameLabel(game)}";
                }
                excludeIds.Add(game.Id);
            }

            var viewedIds = viewed.Select(item => item.GameId).Distinct().ToList();
            var viewedGames = await _gameRepository.GetByIdsAsync(viewedIds);
            var viewedMap = viewedGames.Where(game => !string.IsNullOrWhiteSpace(game.Id))
                .ToDictionary(game => game.Id, game => game);

            foreach (var viewedItem in viewed)
            {
                if (!viewedMap.TryGetValue(viewedItem.GameId, out var game))
                {
                    continue;
                }

                var decay = GetRecencyDecay(viewedItem.LastViewedAt);
                AddWeight(preferenceWeights, game.GameType, 1.5 * decay);
                if (!reasonByType.ContainsKey(game.GameType))
                {
                    reasonByType[game.GameType] = $"Similar to recently viewed: {GetGameLabel(game)}";
                }
                excludeIds.Add(game.Id);
            }

            var topTypes = preferenceWeights
                .OrderByDescending(pair => pair.Value)
                .Take(4)
                .Select(pair => pair.Key)
                .ToHashSet();

            var candidates = allGames
                .Where(game => game != null && !string.IsNullOrWhiteSpace(game.Id))
                .Where(game => topTypes.Contains(game.GameType))
                .Where(game => !excludeIds.Contains(game.Id))
                .Select(game => new ScoredRecommendation
                {
                    Game = game,
                    Score = preferenceWeights.TryGetValue(game.GameType, out var weight) ? weight : 0,
                    Reason = reasonByType.TryGetValue(game.GameType, out var reason) ? reason : "Based on your interests"
                })
                .Select(item =>
                {
                    item.Score += GetReleaseRecencyBoost(item.Game.ReleaseDate);
                    return item;
                })
                .OrderByDescending(item => item.Score)
                .ThenByDescending(item => item.Game.ReleaseDate)
                .ToList();

            var diversified = DiversifyByType(candidates, normalizedLimit, maxSameTypeInRow: 2);

            var recommendations = diversified
                .Select(item => new RecommendationItem
                {
                    Game = item.Game,
                    Reason = item.Reason
                })
                .ToList();

            LogResult(userId, wishlistIds.Count, viewed.Count, recommendations.Count, stopwatch);

            return recommendations;
        }

        private void LogResult(string userId, int wishlistCount, int viewedCount, int recommendationCount, Stopwatch stopwatch)
        {
            stopwatch.Stop();
            _logger.LogInformation(
                "Generated recommendations for {UserId}. Wishlist: {WishlistCount}, Viewed: {ViewedCount}, Returned: {RecommendationCount}, DurationMs: {DurationMs}",
                userId,
                wishlistCount,
                viewedCount,
                recommendationCount,
                stopwatch.ElapsedMilliseconds);
        }

        private async Task<HashSet<string>> GetPurchasedGameIdsAsync(string userId)
        {
            if (_orderRepository == null)
            {
                return new HashSet<string>();
            }

            var orders = await _orderRepository.GetOrdersByUserAsync(userId);
            return orders
                .Select(order => order.GameId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet();
        }

        private static string GetGameLabel(Game game)
        {
            if (!string.IsNullOrWhiteSpace(game.Title))
            {
                return game.Title;
            }

            return game.Name ?? "this game";
        }

        private static void AddWeight(Dictionary<GameType, double> weights, GameType type, double weight)
        {
            if (!weights.ContainsKey(type))
            {
                weights[type] = 0;
            }

            weights[type] += weight;
        }

        private static double GetRecencyDecay(DateTime lastViewedAt)
        {
            var days = Math.Max((DateTime.UtcNow - lastViewedAt).TotalDays, 0);
            var decay = Math.Exp(-days / 30d);
            return Math.Clamp(decay, 0.3, 1);
        }

        private static double GetReleaseRecencyBoost(DateTime releaseDate)
        {
            if (releaseDate == default)
            {
                return 0;
            }

            var days = Math.Max((DateTime.UtcNow - releaseDate).TotalDays, 0);
            var normalized = Math.Clamp(1 - (days / 365d), 0, 1);
            return normalized * 0.5;
        }

        private static IReadOnlyList<RecommendationItem> BuildFallbackRecommendations(
            List<Game> allGames,
            HashSet<string> excludeIds,
            int limit)
        {
            return allGames
                .Where(game => game != null && !string.IsNullOrWhiteSpace(game.Id))
                .Where(game => !excludeIds.Contains(game.Id))
                .OrderByDescending(game => game.ReleaseDate)
                .Take(limit)
                .Select(game => new RecommendationItem
                {
                    Game = game,
                    Reason = "Trending in the store"
                })
                .ToList();
        }

        private static List<ScoredRecommendation> DiversifyByType(
            List<ScoredRecommendation> candidates,
            int limit,
            int maxSameTypeInRow)
        {
            var results = new List<ScoredRecommendation>();
            var remaining = new List<ScoredRecommendation>(candidates);

            while (remaining.Count > 0 && results.Count < limit)
            {
                var next = remaining.FirstOrDefault(item =>
                {
                    if (results.Count < maxSameTypeInRow)
                    {
                        return true;
                    }

                    var recentTypes = results.TakeLast(maxSameTypeInRow).Select(result => result.Game.GameType).Distinct();
                    return !recentTypes.Contains(item.Game.GameType);
                }) ?? remaining.First();

                results.Add(next);
                remaining.Remove(next);
            }

            return results;
        }

        private class ScoredRecommendation
        {
            public Game Game { get; set; }
            public double Score { get; set; }
            public string Reason { get; set; }
        }
    }
}
