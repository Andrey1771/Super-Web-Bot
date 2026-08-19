using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Модерация контента клиентов: отзывы (жалобы, скрытие, ответ магазина) и вопросы на карточке
/// игры (официальный ответ). Раньше клиенты жаловались на отзывы (POST reviews/{id}/report),
/// отзыв уходил в Pending — и на этом всё: списка таких отзывов не было ни у кого. Вопросы
/// без ответа висели на карточке, пока другой покупатель не ответит.
///
/// Списки идут напрямую по коллекциям: репозитории заточены под одну игру, а модератору нужно
/// «все ожидающие по всему магазину».
/// </summary>
[ApiController]
[Route("api/admin/moderation")]
[Authorize(Policy = "SupportAgent")]
public class AdminModerationController : ControllerBase
{
    private readonly IMongoCollection<GameReviewDb> _reviews;
    private readonly IMongoCollection<GameQuestionDb> _questions;
    private readonly IGameReviewRepository _reviewRepository;
    private readonly IGameQuestionRepository _questionRepository;
    private readonly IGameRepository _games;

    public AdminModerationController(
        IMongoDatabase database,
        IGameReviewRepository reviewRepository,
        IGameQuestionRepository questionRepository,
        IGameRepository games)
    {
        _reviews = database.GetCollection<GameReviewDb>("GameReviews");
        _questions = database.GetCollection<GameQuestionDb>("GameQuestions");
        _reviewRepository = reviewRepository;
        _questionRepository = questionRepository;
        _games = games;
    }

    // ---------- сводка ----------

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var pending = await _reviews.CountDocumentsAsync(r => r.Status == nameof(ReviewStatus.Pending), cancellationToken: ct);
        var unanswered = await _questions.CountDocumentsAsync(
            Builders<GameQuestionDb>.Filter.Or(
                Builders<GameQuestionDb>.Filter.Size(q => q.Answers, 0),
                Builders<GameQuestionDb>.Filter.Exists(q => q.Answers, false)),
            cancellationToken: ct);
        return Ok(new { pendingReviews = (int)pending, unansweredQuestions = (int)unanswered });
    }

    // ---------- отзывы ----------

    /// <param name="status">pending | hidden | published | all</param>
    [HttpGet("reviews")]
    public async Task<IActionResult> Reviews([FromQuery] string status = "pending", [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var filter = status.ToLowerInvariant() switch
        {
            "all" => Builders<GameReviewDb>.Filter.Empty,
            "hidden" => Builders<GameReviewDb>.Filter.Eq(r => r.Status, nameof(ReviewStatus.Hidden)),
            "published" => Builders<GameReviewDb>.Filter.Or(
                Builders<GameReviewDb>.Filter.Eq(r => r.Status, nameof(ReviewStatus.Published)),
                Builders<GameReviewDb>.Filter.Eq(r => r.Status, null),
                Builders<GameReviewDb>.Filter.Eq(r => r.Status, string.Empty)),
            _ => Builders<GameReviewDb>.Filter.Eq(r => r.Status, nameof(ReviewStatus.Pending))
        };

        var safePage = Math.Max(1, page);
        var safeSize = Math.Clamp(pageSize, 1, 100);
        var total = await _reviews.CountDocumentsAsync(filter, cancellationToken: ct);

        // Ожидающие — по свежести жалобы; остальные — по дате отзыва.
        var sort = status.Equals("pending", StringComparison.OrdinalIgnoreCase)
            ? Builders<GameReviewDb>.Sort.Descending(r => r.LastReportedAt).Descending(r => r.CreatedAt)
            : Builders<GameReviewDb>.Sort.Descending(r => r.CreatedAt);

        var items = await _reviews.Find(filter).Sort(sort).Skip((safePage - 1) * safeSize).Limit(safeSize).ToListAsync(ct);
        var titles = await GameTitlesAsync(items.Select(r => r.GameId));

        return Ok(new
        {
            total,
            items = items.Select(r => new
            {
                id = r.Id,
                gameId = r.GameId,
                gameTitle = titles.TryGetValue(r.GameId ?? string.Empty, out var t) ? t : r.GameId,
                userName = r.UserName,
                userId = r.UserId,
                rating = r.Rating,
                recommend = r.Recommend,
                text = r.Text,
                images = r.Images?.Count ?? 0,
                createdAt = r.CreatedAt,
                status = string.IsNullOrEmpty(r.Status) ? nameof(ReviewStatus.Published) : r.Status,
                reportCount = r.ReportCount,
                lastReportedAt = r.LastReportedAt,
                helpfulCount = r.HelpfulCount,
                shopReply = r.ShopReply is null ? null : new { r.ShopReply.Text, r.ShopReply.Author, r.ShopReply.CreatedAt }
            })
        });
    }

    [HttpPost("reviews/{id}/publish")]
    public Task<IActionResult> Publish(string id) => SetReviewStatus(id, ReviewStatus.Published);

    [HttpPost("reviews/{id}/hide")]
    public Task<IActionResult> Hide(string id) => SetReviewStatus(id, ReviewStatus.Hidden);

    /// <summary>Ответ магазина под отзывом. Пустой текст снимает ответ.</summary>
    [HttpPost("reviews/{id}/reply")]
    public async Task<IActionResult> Reply(string id, [FromBody] ModerationTextRequest request)
    {
        var review = await _reviewRepository.GetByIdAsync(id);
        if (review is null)
        {
            return NotFound();
        }

        var text = (request?.Text ?? string.Empty).Trim();
        review.ShopReply = text.Length == 0
            ? null
            : new ReviewReply { Text = text, Author = SupportUserContext.FromClaims(User).Email, CreatedAt = DateTime.UtcNow };
        review.UpdatedAt = DateTime.UtcNow;
        await _reviewRepository.UpdateAsync(id, review);
        return Ok(new { ok = true, message = text.Length == 0 ? "Reply removed." : "Reply published under the review." });
    }

    private async Task<IActionResult> SetReviewStatus(string id, ReviewStatus status)
    {
        var review = await _reviewRepository.GetByIdAsync(id);
        if (review is null)
        {
            return NotFound();
        }

        review.Status = status;
        review.UpdatedAt = DateTime.UtcNow;
        await _reviewRepository.UpdateAsync(id, review);
        return Ok(new { ok = true, message = status == ReviewStatus.Published ? "Review is visible again." : "Review hidden from the storefront." });
    }

    // ---------- вопросы ----------

    /// <param name="filter">unanswered | all</param>
    [HttpGet("questions")]
    public async Task<IActionResult> Questions([FromQuery] string filter = "unanswered", [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var mongoFilter = filter.Equals("all", StringComparison.OrdinalIgnoreCase)
            ? Builders<GameQuestionDb>.Filter.Empty
            : Builders<GameQuestionDb>.Filter.Or(
                Builders<GameQuestionDb>.Filter.Size(q => q.Answers, 0),
                Builders<GameQuestionDb>.Filter.Exists(q => q.Answers, false));

        var safePage = Math.Max(1, page);
        var safeSize = Math.Clamp(pageSize, 1, 100);
        var total = await _questions.CountDocumentsAsync(mongoFilter, cancellationToken: ct);
        var items = await _questions.Find(mongoFilter)
            .SortByDescending(q => q.CreatedAt)
            .Skip((safePage - 1) * safeSize).Limit(safeSize)
            .ToListAsync(ct);
        var titles = await GameTitlesAsync(items.Select(q => q.GameId));

        return Ok(new
        {
            total,
            items = items.Select(q => new
            {
                id = q.Id,
                gameId = q.GameId,
                gameTitle = titles.TryGetValue(q.GameId ?? string.Empty, out var t) ? t : q.GameId,
                userName = q.UserName,
                question = q.Question,
                createdAt = q.CreatedAt,
                answers = (q.Answers ?? new List<GameAnswerDb>()).Select(a => new { a.Id, a.UserName, a.Text, a.CreatedAt, a.IsOfficial })
            })
        });
    }

    /// <summary>Официальный ответ магазина: помечается на витрине как «Official».</summary>
    [HttpPost("questions/{id}/answer")]
    public async Task<IActionResult> Answer(string id, [FromBody] ModerationTextRequest request)
    {
        var text = (request?.Text ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return BadRequest(new { message = "Answer text is required." });
        }

        var exists = await _questions.Find(q => q.Id == id).AnyAsync();
        if (!exists)
        {
            return NotFound();
        }

        var agent = SupportUserContext.FromClaims(User);
        await _questionRepository.AddAnswerAsync(id, new GameAnswer
        {
            Id = ObjectId.GenerateNewId().ToString(),
            UserId = agent.UserId,
            UserName = "Tale Shop",
            Text = text,
            CreatedAt = DateTime.UtcNow,
            IsOfficial = true
        });
        return Ok(new { ok = true, message = "Answer published." });
    }

    // ---------- helpers ----------

    private async Task<Dictionary<string, string>> GameTitlesAsync(IEnumerable<string?> ids)
    {
        var list = ids.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList()!;
        if (list.Count == 0)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
        var games = await _games.GetByIdsAsync(list!);
        return games.Where(g => g.Id != null)
            .ToDictionary(g => g.Id!, g => string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title, StringComparer.OrdinalIgnoreCase);
    }
}

public class ModerationTextRequest
{
    public string? Text { get; set; }
}
