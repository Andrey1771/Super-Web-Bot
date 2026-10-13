using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SuperBot.Common.Auth;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api")]
public class GameReviewsController : ControllerBase
{
    /// <summary>Ключ и срок кэша витринной сводки: она общая для всех, поэтому ключ фиксированный.</summary>
    public const string SiteSummaryCacheKey = "reviews:site-summary";
    private static readonly TimeSpan SiteSummaryCacheTtl = TimeSpan.FromMinutes(10);

    /// <summary>Сколько свежих отзывов показываем цитатами на витрине.</summary>
    /// <summary>
    /// Сколько свежих отзывов отдавать витрине. Двух хватало на статичную пару карточек;
    /// на странице «О нас» они теперь листаются каруселью, и листать нужно что-то.
    /// Десять — чтобы лента не заканчивалась через один щелчок и при этом не тянуть
    /// половину коллекции ради блока, который читают по диагонали.
    /// </summary>
    private const int SiteSummaryQuoteCount = 10;

    private readonly IGameReviewRepository _gameReviewRepository;
    private readonly IGameReviewHelpfulRepository _helpfulRepository;
    private readonly IGameReviewReportRepository _reportRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly IGameRepository _gameRepository;
    private readonly IMemoryCache _memoryCache;
    private readonly SuperBot.WebApi.Services.UserAvatarLookup _avatars;

    public GameReviewsController(
        IGameReviewRepository gameReviewRepository,
        IGameReviewHelpfulRepository helpfulRepository,
        IGameReviewReportRepository reportRepository,
        IOrderRepository orderRepository,
        IGameRepository gameRepository,
        IMemoryCache memoryCache,
        SuperBot.WebApi.Services.UserAvatarLookup avatars)
    {
        _gameReviewRepository = gameReviewRepository;
        _helpfulRepository = helpfulRepository;
        _reportRepository = reportRepository;
        _orderRepository = orderRepository;
        _gameRepository = gameRepository;
        _memoryCache = memoryCache;
        _avatars = avatars;
    }

    /// <summary>Витринная цитата: отзыв вместе с игрой, на которую он написан.</summary>
    public sealed record SiteReviewQuote(
        string Author, int Rating, string Text, bool VerifiedPurchase,
        DateTime CreatedAt, string? GameTitle, string? GameSlug, string? AvatarUrl);

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

        var recent = await BuildQuoteSampleAsync(summary);
        var games = await _gameRepository.GetByIdsAsync(recent.Select(review => review.GameId));
        var gameById = games
            .Where(game => !string.IsNullOrWhiteSpace(game.Id))
            .ToDictionary(game => game.Id!, game => game);

        // Аватары — одним запросом на всю пачку, а не по отзыву на штуку.
        var avatarByUser = await _avatars.ForUsersAsync(recent.Select(review => review.UserId));

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
                game?.Slug,
                AvatarFor(avatarByUser, review.UserId));
        }).ToList();

        return new SiteReviewSummary(summary.Average, summary.Count, summary.Distribution, quotes);
    }

    /// <summary>
    /// Отзывы для ленты на витрине — по долям оценок, а не «десять последних».
    ///
    /// Случайная выборка последних врёт в обе стороны: неделя неудачных заказов даёт стену
    /// недовольства при средней 4.1, неделя удачных — сплошные пятёрки. Здесь каждой оценки
    /// берётся столько, какова её доля в распределении, которое нарисовано полосками над самой
    /// лентой. Отбора по оценке нет: прятать двойки, оставив среднюю на виду, — это витрина,
    /// противоречащая собственным цифрам.
    /// </summary>
    /// <summary>Аватар автора, если он вообще есть: отсутствие ключа и значит «нет аватара».</summary>
    private static string? AvatarFor(IReadOnlyDictionary<string, string> avatarByUser, string? userId) =>
        !string.IsNullOrWhiteSpace(userId) && avatarByUser.TryGetValue(userId!, out var url) ? url : null;

    private async Task<IReadOnlyList<GameReview>> BuildQuoteSampleAsync(GameReviewSummary summary)
    {
        var quotas = ReviewSample.Quotas(summary.Distribution, SiteSummaryQuoteCount);
        if (quotas.Count == 0)
        {
            return await _gameReviewRepository.GetRecentPublishedAsync(SiteSummaryQuoteCount);
        }

        var picked = new List<GameReview>();
        foreach (var (rating, take) in quotas)
        {
            picked.AddRange(await _gameReviewRepository.GetRecentPublishedByRatingAsync(rating, take));
        }

        // Распределение считается по ВСЕМ отзывам, а текст есть не у каждого: если по какой-то
        // оценке не набралось отзывов с текстом, добираем свежими, чтобы лента не поредела.
        if (picked.Count < SiteSummaryQuoteCount)
        {
            var known = picked.Select(review => review.Id).ToHashSet(StringComparer.Ordinal);
            var filler = await _gameReviewRepository.GetRecentPublishedAsync(SiteSummaryQuoteCount);
            picked.AddRange(filler.Where(review => known.Add(review.Id)).Take(SiteSummaryQuoteCount - picked.Count));
        }

        return ReviewSample.Interleave(picked, review => review.Rating);
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

        // Аватар в отзыве не хранится — подставляем из профиля на момент показа.
        // Один запрос на страницу выдачи (до 50 отзывов), а не по запросу на отзыв.
        var avatarByUser = await _avatars.ForUsersAsync(items.Select(review => review.UserId));
        foreach (var review in items)
        {
            review.AvatarUrl = AvatarFor(avatarByUser, review.UserId);
        }

        return Ok(new { items, total });
    }

    [Authorize]
    [HttpPost("games/{gameId}/reviews")]
    public async Task<IActionResult> CreateReview(string gameId, [FromBody] ReviewRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(SuperBot.WebApi.Services.ApiErrors.Body("review.textRequired", "Review text is required."));
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
            return Conflict(SuperBot.WebApi.Services.ApiErrors.Body("review.exists", "Review already exists."));
        }

        // По всем именам из токена (email, логин, sub) — заказ записан по email, а не по Identity.Name.
        var orders = await _orderRepository.GetOrdersByUsersAsync(User.GetOrderOwnerAliases());
        // Смотрим позиции заказа, а не order.GameId: в том поле лежит только первая игра
        // набора, и отзыв на вторую и последующие сервер отклонял как «вы это не покупали».
        var verifiedPurchase = SuperBot.Core.Services.PurchasedGames.Contains(orders, gameId);
        if (!verifiedPurchase)
        {
            // Отзыв — только от покупателя: иначе «Verified purchase» ничего не значит, а страница
            // зарастает оценками от тех, кто игру не открывал. Фронт форму и не показывает, это страховка.
            return StatusCode(StatusCodes.Status403Forbidden, SuperBot.WebApi.Services.ApiErrors.Body("review.purchaseOnly", "Only customers who bought this game can review it."));
        }

        // Имя, под которым записан заказ с этой игрой: по нему возврат потом найдёт отзыв.
        var buyerKey = orders.FirstOrDefault(order => order.IsPaid && SuperBot.Core.Services.PurchasedGames.From(new[] { order }).Contains(gameId))?.UserName;

        var review = new GameReview
        {
            GameId = gameId,
            UserId = userId,
            UserName = userName,
            BuyerKey = buyerKey,
            // Отзыв после возврата — можно, но с пометкой сразу.
            Refunded = SuperBot.Core.Services.RefundedPurchases.IsRefunded(orders, gameId),
            Rating = Math.Clamp(request.Rating, 1, 5),
            PlaytimeHours = request.PlaytimeHours,
            Text = request.Text,
            Images = request.Images?.Select(item => new ReviewImage { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? new List<ReviewImage>(),
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

        var nextText = request.Text ?? review.Text;
        var nextRating = request.Rating > 0 ? Math.Clamp(request.Rating, 1, 5) : review.Rating;
        var nextPlaytime = request.PlaytimeHours ?? review.PlaytimeHours;
        var changed = !string.Equals(nextText, review.Text, StringComparison.Ordinal) || nextRating != review.Rating || nextPlaytime != review.PlaytimeHours;

        if (changed)
        {
            // Прежняя версия — в историю для модератора: с пометкой, была ли правка уже под жалобами.
            review.Revisions ??= new List<ReviewRevision>();
            review.Revisions.Add(new ReviewRevision
            {
                Text = review.Text,
                Rating = review.Rating,
                PlaytimeHours = review.PlaytimeHours,
                ReplacedAt = DateTime.UtcNow,
                UnderReport = review.ReportCount > 0 || review.Status == ReviewStatus.Pending
            });
            // Правка автора — отдельно от UpdatedAt: тот меняют и модерация, и жалоба, а «Edited» должно
            // появляться только когда человек сам что-то изменил.
            review.EditedAt = DateTime.UtcNow;
        }

        review.Text = nextText;
        review.Rating = nextRating;
        review.PlaytimeHours = nextPlaytime;
        review.Images = request.Images?.Select(item => new ReviewImage { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? review.Images;
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

    public sealed record ReportRequest(string Reason, string? Comment);

    public const int ReportCommentMaxLength = 500;

    /// <summary>
    /// Жалоба на отзыв — заявка модератору с причиной и комментарием, как у Steam и Amazon.
    /// Одна жалоба ничего не прячет: отзыв уходит с витрины (Pending) по порогу разных жалобщиков
    /// или сразу для спама и вредоносных ссылок (ReviewReportPolicy). Один пользователь — одна
    /// жалоба на отзыв, повтор — 409. Раньше любой клик без причины прятал отзыв мгновенно.
    /// </summary>
    [Authorize]
    [HttpPost("reviews/{reviewId}/report")]
    public async Task<IActionResult> ReportReview(string reviewId, [FromBody] ReportRequest? request)
    {
        if (request is null || !Enum.TryParse<ReviewReportReason>(request.Reason, true, out var reason))
        {
            return BadRequest(SuperBot.WebApi.Services.ApiErrors.Body("review.reportReason", "Pick a reason for the report."));
        }
        var comment = request.Comment?.Trim();
        if (comment is { Length: > ReportCommentMaxLength })
        {
            return BadRequest(SuperBot.WebApi.Services.ApiErrors.Body("review.reportTooLong", $"Details are limited to {ReportCommentMaxLength} characters.", new { max = ReportCommentMaxLength }));
        }
        if (reason == ReviewReportReason.Other && string.IsNullOrWhiteSpace(comment))
        {
            return BadRequest(SuperBot.WebApi.Services.ApiErrors.Body("review.reportDetails", "Tell us what is wrong with the review."));
        }

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
        if (string.Equals(review.UserId, userId, StringComparison.Ordinal))
        {
            return BadRequest(SuperBot.WebApi.Services.ApiErrors.Body("review.reportOwn", "You cannot report your own review — edit or delete it instead."));
        }

        var added = await _reportRepository.AddAsync(new GameReviewReport
        {
            ReviewId = reviewId,
            UserId = userId,
            UserName = GetUserName(),
            Reason = reason,
            Comment = comment,
            CreatedAt = DateTime.UtcNow
        });
        if (!added)
        {
            return Conflict(SuperBot.WebApi.Services.ApiErrors.Body("review.alreadyReported", "You have already reported this review."));
        }

        var reporters = await _reportRepository.CountReportersAsync(reviewId);
        review.ReportCount = reporters;
        review.LastReportedAt = DateTime.UtcNow;
        var hidden = false;
        if (review.Status == ReviewStatus.Published && ReviewReportPolicy.ShouldHide(reason, reporters))
        {
            review.Status = ReviewStatus.Pending;
            review.UpdatedAt = DateTime.UtcNow;
            hidden = true;
        }
        await _gameReviewRepository.UpdateAsync(reviewId, review);
        return Ok(new { reported = true, hidden, reports = reporters });
    }

    // Не «sub» напрямую: JwtBearer отдаёт его как NameIdentifier (см. CurrentUserExtensions.GetUserId).
    private string GetUserId() => User.GetUserId();

    private string GetUserName()
    {
        return User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value ?? User.FindFirst("email")?.Value ?? string.Empty;
    }

    public class ReviewRequest
    {
        public int Rating { get; set; }
        public double? PlaytimeHours { get; set; }
        public string Text { get; set; }
        public List<ReviewImageRequest> Images { get; set; } = new();
    }

    public class ReviewImageRequest
    {
        public string Url { get; set; }
        public string ThumbUrl { get; set; }
    }
}
