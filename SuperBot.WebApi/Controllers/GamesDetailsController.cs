using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/games")]
public class GamesDetailsController : ControllerBase
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameDetailsRepository _gameDetailsRepository;
    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IWishlistRepository _wishlistRepository;
    private readonly IOrderRepository _orderRepository;

    public GamesDetailsController(
        IGameRepository gameRepository,
        IGameDetailsRepository gameDetailsRepository,
        IGameReviewRepository gameReviewRepository,
        IWishlistRepository wishlistRepository,
        IOrderRepository orderRepository)
    {
        _gameRepository = gameRepository;
        _gameDetailsRepository = gameDetailsRepository;
        _gameReviewRepository = gameReviewRepository;
        _wishlistRepository = wishlistRepository;
        _orderRepository = orderRepository;
    }

    [HttpGet("{slug}")]
    public async Task<IActionResult> GetGameBySlug(string slug)
    {
        if (string.IsNullOrWhiteSpace(slug))
        {
            return BadRequest("Slug is required.");
        }

        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            var game = await _gameRepository.GetBySlugAsync(normalizedSlug)
                ?? (normalizedSlug != slug ? await _gameRepository.GetBySlugAsync(slug) : null);
            if (game == null)
            {
                var games = await _gameRepository.GetAllAsync();
                game = games.FirstOrDefault(candidate =>
                    NormalizeSlug(candidate?.Slug) == normalizedSlug
                    || NormalizeSlug(candidate?.Title ?? candidate?.Name) == normalizedSlug);
                if (game == null)
                {
                    return NotFound();
                }
            }

            details = BuildDefaultDetails(game);
            await _gameDetailsRepository.UpsertAsync(details);
        }

        var pricing = BuildPricing(details);
        var summary = await _gameReviewRepository.GetSummaryAsync(details.GameId);
        details.RatingAvg = summary.Average;
        details.ReviewsCount = summary.Count;

        var heroBadges = BuildHeroBadges(details);
        var recommendations = new
        {
            moreLikeThis = await BuildRecommendations(details)
        };

        var userContext = await BuildUserContext(details.GameId);

        return Ok(new
        {
            game = details,
            pricing,
            ratingSummary = new
            {
                avg = summary.Average,
                count = summary.Count,
                distribution = summary.Distribution
            },
            heroBadges,
            recommendations,
            userContext
        });
    }

    [HttpGet("{slug}/recommendations")]
    public async Task<IActionResult> GetRecommendations(string slug, [FromQuery] int limit = 8)
    {
        var normalizedSlug = NormalizeSlug(slug);
        var details = await _gameDetailsRepository.GetBySlugAsync(normalizedSlug);
        if (details == null && normalizedSlug != slug)
        {
            details = await _gameDetailsRepository.GetBySlugAsync(slug);
        }
        if (details == null)
        {
            return NotFound();
        }

        var recommendations = await BuildRecommendations(details, limit);
        return Ok(new { items = recommendations });
    }

    private GameDetails BuildDefaultDetails(Game game)
    {
        return new GameDetails
        {
            GameId = game.Id,
            Slug = string.IsNullOrWhiteSpace(game.Slug)
                ? NormalizeSlug(game.Title ?? game.Name)
                : NormalizeSlug(game.Slug),
            Title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
            Tagline = string.Empty,
            DescriptionMarkdown = string.Empty,
            Cover = string.IsNullOrWhiteSpace(game.ImagePath)
                ? null
                : new GameCover { Url = game.ImagePath, Alt = game.Title ?? game.Name },
            BasePrice = game.Price,
            Currency = "USD",
            FinalPrice = game.Price,
            IsActive = true,
            Platforms = new GamePlatforms { Windows = true },
            ReleaseDate = game.ReleaseDate
        };
    }

    private static object BuildPricing(GameDetails details)
    {
        var discount = details.DiscountPercent ?? 0;
        var finalPrice = details.BasePrice;
        if (discount > 0)
        {
            finalPrice = Math.Round(details.BasePrice * (1 - (discount / 100m)), 2, MidpointRounding.AwayFromZero);
        }

        details.FinalPrice = finalPrice;

        return new
        {
            price = finalPrice,
            oldPrice = discount > 0 ? details.BasePrice : (decimal?)null,
            discountPercent = discount > 0 ? discount : (decimal?)null,
            currency = details.Currency ?? "USD"
        };
    }

    private static List<string> BuildHeroBadges(GameDetails details)
    {
        var badges = new List<string>();
        if (details.IsTopRated)
        {
            badges.Add("Top rated");
        }
        if (details.IsNew)
        {
            badges.Add("New");
        }
        if (details.DiscountPercent.HasValue && details.DiscountPercent.Value > 0)
        {
            badges.Add($"-{details.DiscountPercent.Value:0}%");
        }
        badges.Add(details.KeyType switch
        {
            GameKeyType.Epic => "Epic key",
            GameKeyType.EaApp => "EA App",
            GameKeyType.Uplay => "Uplay key",
            _ => "Steam key"
        });
        return badges;
    }

    private async Task<List<object>> BuildRecommendations(GameDetails details, int limit = 8)
    {
        var normalizedLimit = Math.Clamp(limit, 1, 12);
        var results = new List<object>();

        if (details.SimilarGameIds?.Count > 0)
        {
            var similarGames = await _gameRepository.GetByIdsAsync(details.SimilarGameIds);
            results.AddRange(similarGames.Select(BuildGameCard));
        }

        if (results.Count < normalizedLimit)
        {
            var allGames = await _gameRepository.GetAllAsync();
            var fallback = allGames
                .Where(game => game.Id != details.GameId)
                .Take(normalizedLimit - results.Count)
                .Select(BuildGameCard);
            results.AddRange(fallback);
        }

        return results.Take(normalizedLimit).ToList();
    }

    private object BuildGameCard(Game game)
    {
        return new
        {
            id = game.Id,
            slug = game.Slug,
            title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
            coverUrl = game.ImagePath,
            price = game.Price,
            rating = 0
        };
    }

    private async Task<object> BuildUserContext(string gameId)
    {
        if (!User.Identity?.IsAuthenticated ?? true)
        {
            return new { isWishlisted = false, hasPurchased = false, myReview = (object)null };
        }

        var userId = GetUserId();
        var userName = GetUserName();
        var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);
        var orders = await _orderRepository.GetOrdersByUserAsync(userName);
        var hasPurchased = orders.Any(order => order.GameId == gameId && order.IsPaid);
        var review = await _gameReviewRepository.GetByUserAsync(gameId, userId);

        return new
        {
            isWishlisted = wishlistIds.Contains(gameId),
            hasPurchased,
            myReview = review
        };
    }

    private string GetUserId()
    {
        return User.FindFirst("sub")?.Value ?? User.FindFirst("userId")?.Value ?? string.Empty;
    }

    private string GetUserName()
    {
        return User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value ?? User.FindFirst("email")?.Value ?? string.Empty;
    }

    private static string NormalizeSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        var lastWasDash = false;

        foreach (var ch in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(ch);
                lastWasDash = false;
                continue;
            }

            if (ch == ' ' || ch == '-' || ch == '_')
            {
                if (!lastWasDash && builder.Length > 0)
                {
                    builder.Append('-');
                    lastWasDash = true;
                }
            }
        }

        var normalized = builder.ToString().Trim('-');
        return normalized;
    }
}
