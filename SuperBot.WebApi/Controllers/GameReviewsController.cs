using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api")]
public class GameReviewsController : ControllerBase
{
    /// <summary>Ключ и срок кэша витринной сводки: она общая для всех, поэтому ключ фиксированный.</summary>
    public const string SiteSummaryCacheKey = "reviews:site-summary";
    private static readonly TimeSpan SiteSummaryCacheTtl = TimeSpan.FromMinutes(10);

    /// <summary>Сколько свежих отзывов показываем цитатами на витрине.</summary>
    private const int SiteSummaryQuoteCount = 2;

    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IGameReviewHelpfulRepository _helpfulRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;
    private readonly IMemoryCache _memoryCache;

    public GameReviewsController(
        IGameReviewRepository gameReviewRepository,
        IGameReviewHelpfulRepository helpfulRepository,
        IOrderRepository orderRepository,
        IGameRepository gameRepository,
        IMemoryCache memoryCache)
    {
        _gameReviewRepository = gameReviewRepository;
        _helpfulRepository = helpfulRepository;
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
        _memoryCache = memoryCache;
    }

    /// <summary>Витринная цитата: отзыв вместе с игрой, на которую он написан.</summary>
    public sealed record SiteReviewQuote(
        string Author, int Rating, string Text, bool VerifiedPurchase,
        DateTime CreatedAt, string? GameTitle, string? GameSlug);

    /// <summary>Рейтинг магазина: средняя оценка, распределение и пара свежих цитат.</summary>
    public sealed record SiteReviewSummary(
        double Average, int Count, IReadOnlyDictionary<int, int> Distribution, IReadOnlyList<SiteReviewQuote> Quotes);

    /// <summary>
    /// Сводка отзывов по всему магазину для витрины каталога.
    /// Одинакова для всех посетителей, поэтому кэш общий и с фиксированным ключом.
    /// </summary>
    [HttpGet("reviews/summary")]
    public async Task<IActionResult> GetSiteSummary()
    {
        var summary = await _memoryCache.GetOrCreateAsync(SiteSummaryCacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = SiteSummaryCacheTtl;
            return await BuildSiteSummaryAsync();
        });

        return Ok(summary);
    }

    private async Task<SiteReviewSummary> BuildSiteSummaryAsync()
    {
        var summary = await _gameReviewRepository.GetSiteSummaryAsync();
        if (summary.Count == 0)
        {
            // Пустая сводка — нормальное состояние молодого магазина, а не ошибка:
            // витрина по нулевому счётчику рисует «отзывов пока нет».
            return new SiteReviewSummary(0, 0, new Dictionary<int, int>(), Array.Empty<SiteReviewQuote>());
        }

        var recent = await _gameReviewRepository.GetRecentPublishedAsync(SiteSummaryQuoteCount);
        var games = await _gameRepository.GetByIdsAsync(recent.Select(review => review.GameId));
        var gameById = games
            .Where(game => !string.IsNullOrWhiteSpace(game.Id))
            .ToDictionary(game => game.Id!, game => game);

        var quotes = recent.Select(review =>
        {
            gameById.TryGetValue(review.GameId ?? string.Empty, out var game);
            return new SiteReviewQuote(
                review.UserName,
                review.Rating,
                review.Text,
                review.VerifiedPurchase,
                review.CreatedAt,
                game?.Title ?? game?.Name,
                game?.Slug);
        }).ToList();

        return new SiteReviewSummary(summary.Average, summary.Count, summary.Distribution, quotes);
    }

    [HttpGet("games/{gameId}/reviews")]
    public async Task<IActionResult> GetReviews(
        string gameId,
        [FromQuery] string sort = "createdAt:desc",
        [FromQuery] int? rating = null,
        [FromQuery] bool? withPlaytime = null,
        [FromQuery] bool? withImages = null,
        [FromQuery] string q = "",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        var query = new GameReviewQuery
        {
            GameId = gameId,
            Sort = sort,
            Rating = rating,
            WithPlaytime = withPlaytime,
            WithImages = withImages,
            Search = q,
            Page = Math.Max(1, page),
            PageSize = Math.Clamp(pageSize, 1, 50)
        };

        var (items, total) = await _gameReviewRepository.GetPagedAsync(query);
        return Ok(new { items, total });
    }

    [Authorize]
    [HttpPost("games/{gameId}/reviews")]
    public async Task<IActionResult> CreateReview(string gameId, [FromBody] ReviewRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest("Review text is required.");
        }

        var userId = GetUserId();
        var userName = GetUserName();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var existing = await _gameReviewRepository.GetByUserAsync(gameId, userId);
        if (existing != null)
        {
            return Conflict("Review already exists.");
        }

        var orders = await _orderRepository.GetOrdersByUserAsync(userName);
        var verifiedPurchase = orders.Any(order => order.GameId == gameId && order.IsPaid);

        var review = new GameReview
        {
            GameId = gameId,
            UserId = userId,
            UserName = userName,
            Rating = Math.Clamp(request.Rating, 1, 5),
            PlaytimeHours = request.PlaytimeHours,
            Text = request.Text,
            Images = request.Images?.Select(item => new ReviewImage { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? new List<ReviewImage>(),
            Recommend = request.Recommend,
            CreatedAt = DateTime.UtcNow,
            VerifiedPurchase = verifiedPurchase,
            Status = ReviewStatus.Published
        };

        await _gameReviewRepository.CreateAsync(review);
        _memoryCache.Remove(SiteSummaryCacheKey);
        return Ok(review);
    }

    [Authorize]
    [HttpPut("reviews/{reviewId}")]
    public async Task<IActionResult> UpdateReview(string reviewId, [FromBody] ReviewRequest request)
    {
        var review = await _gameReviewRepository.GetByIdAsync(reviewId);
        if (review == null)
        {
            return NotFound();
        }

        var userId = GetUserId();
        if (review.UserId != userId)
        {
            return Forbid();
        }

        review.Text = request.Text ?? review.Text;
        review.Rating = request.Rating > 0 ? Math.Clamp(request.Rating, 1, 5) : review.Rating;
        review.PlaytimeHours = request.PlaytimeHours ?? review.PlaytimeHours;
        review.Images = request.Images?.Select(item => new ReviewImage { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? review.Images;
        review.Recommend = request.Recommend;
        review.UpdatedAt = DateTime.UtcNow;

        await _gameReviewRepository.UpdateAsync(reviewId, review);
        // Оценку могли изменить — средняя по магазину пересчитается при следующем запросе.
        _memoryCache.Remove(SiteSummaryCacheKey);
        return Ok(review);
    }

    [Authorize]
    [HttpPost("reviews/{reviewId}/helpful")]
    public async Task<IActionResult> ToggleHelpful(string reviewId)
    {
        var userId = GetUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var review = await _gameReviewRepository.GetByIdAsync(reviewId);
        if (review == null)
        {
            return NotFound();
        }

        var isHelpful = await _helpfulRepository.ToggleAsync(reviewId, userId);
        var nextCount = Math.Max(0, review.HelpfulCount + (isHelpful ? 1 : -1));
        await _gameReviewRepository.UpdateHelpfulCountAsync(reviewId, nextCount);

        return Ok(new { helpful = isHelpful, count = nextCount });
    }

    [Authorize]
    [HttpPost("reviews/{reviewId}/report")]
    public async Task<IActionResult> ReportReview(string reviewId)
    {
        var review = await _gameReviewRepository.GetByIdAsync(reviewId);
        if (review == null)
        {
            return NotFound();
        }

        // Жалоба снимает отзыв с витрины до решения модератора (Pending) и считается — по числу
        // жалоб модератор понимает, «один обиделся» или «все жалуются». Раньше отзыв тоже уходил
        // в Pending, но список таких отзывов никто не видел: жалобы уходили в никуда.
        review.Status = ReviewStatus.Pending;
        review.ReportCount += 1;
        review.LastReportedAt = DateTime.UtcNow;
        review.UpdatedAt = DateTime.UtcNow;
        await _gameReviewRepository.UpdateAsync(reviewId, review);
        return Ok();
    }

    private string GetUserId()
    {
        return User.FindFirst("sub")?.Value ?? User.FindFirst("userId")?.Value ?? string.Empty;
    }

    private string GetUserName()
    {
        return User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value ?? User.FindFirst("email")?.Value ?? string.Empty;
    }

    public class ReviewRequest
    {
        public int Rating { get; set; }
        public double? PlaytimeHours { get; set; }
        public string Text { get; set; }
        public bool Recommend { get; set; }
        public List<ReviewImageRequest> Images { get; set; } = new();
    }

    public class ReviewImageRequest
    {
        public string Url { get; set; }
        public string ThumbUrl { get; set; }
    }
}
