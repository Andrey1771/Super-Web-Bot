using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api")]
public class GameReviewsController : ControllerBase
{
    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IGameReviewHelpfulRepository _helpfulRepository;
    private readonly IOrderRepository _orderRepository;

    public GameReviewsController(
        IGameReviewRepository gameReviewRepository,
        IGameReviewHelpfulRepository helpfulRepository,
        IOrderRepository orderRepository)
    {
        _gameReviewRepository = gameReviewRepository;
        _helpfulRepository = helpfulRepository;
        _orderRepository = orderRepository;
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

        review.Status = ReviewStatus.Pending;
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
