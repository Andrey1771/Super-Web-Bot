using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services;
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
    private readonly IGameReviewRepository _reviewRepository;
    private readonly IGameReviewReportRepository _reportRepository;
    private readonly IGameRepository _games;
    private readonly SuperBot.WebApi.Services.UserAvatarLookup _avatars;
    private readonly SuperBot.WebApi.Services.UserAvatarStore _avatarStore;
    private readonly ILogger<AdminModerationController> _logger;

    public AdminModerationController(
        IMongoDatabase database,
        IGameReviewRepository reviewRepository,
        IGameReviewReportRepository reportRepository,
        IGameRepository games,
        SuperBot.WebApi.Services.UserAvatarLookup avatars,
        SuperBot.WebApi.Services.UserAvatarStore avatarStore,
        ILogger<AdminModerationController> logger)
    {
        _reviews = database.GetCollection<GameReviewDb>("GameReviews");
        _reviewRepository = reviewRepository;
        _reportRepository = reportRepository;
        _games = games;
        _avatars = avatars;
        _avatarStore = avatarStore;
        _logger = logger;
    }

    // ---------- сводка ----------

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var pending = await _reviews.CountDocumentsAsync(r => r.Status == nameof(ReviewStatus.Pending), cancellationToken: ct);
        return Ok(new { pendingReviews = (int)pending });
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
        // Картинка — такая же часть отзыва, как текст: жалоба на неё приходит той же кнопкой
        // и должна разбираться здесь же, а не отдельным процессом.
        var avatars = await _avatars.ForUsersAsync(items.Select(r => r.UserId));
        // Жалобы с причинами и комментариями: по ним модератор понимает, «один обиделся» или «все жалуются на спам».
        var reports = (await _reportRepository.ForReviewsAsync(items.Select(r => r.Id)))
            .GroupBy(report => report.ReviewId)
            .ToDictionary(group => group.Key, group => group.ToList());

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
                avatarUrl = !string.IsNullOrWhiteSpace(r.UserId) && avatars.TryGetValue(r.UserId, out var avatar) ? avatar : null,
                rating = r.Rating,
                recommend = ReviewVerdict.FromRating(r.Rating),
                text = r.Text,
                images = r.Images?.Count ?? 0,
                createdAt = r.CreatedAt,
                status = string.IsNullOrEmpty(r.Status) ? nameof(ReviewStatus.Published) : r.Status,
                reportCount = r.ReportCount,
                refunded = r.Refunded,
                editedAt = r.EditedAt,
                // Прошлые версии, свежие первыми: модератор сравнивает, что было до правки.
                revisions = (r.Revisions ?? new List<ReviewRevisionDb>())
                    .OrderByDescending(rev => rev.ReplacedAt)
                    .Select(rev => new { rev.Text, rev.Rating, rev.PlaytimeHours, rev.ReplacedAt, rev.UnderReport }),
                lastReportedAt = r.LastReportedAt,
                reports = reports.TryGetValue(r.Id, out var list)
                    ? list.Select(report => new { reason = report.Reason.ToString(), comment = report.Comment, userName = report.UserName, createdAt = report.CreatedAt })
                    : Enumerable.Empty<object>(),
                helpfulCount = r.HelpfulCount
            })
        });
    }

    /// <summary>
    /// Снимает аватар автора отзыва. Отдельным действием от «скрыть отзыв»: текст может быть
    /// нормальным, а картинка нет, и наоборот. Аватар в отзыве не хранится, поэтому снимается
    /// он у профиля — и пропадает сразу везде, где показан.
    ///
    /// Сам отзыв не трогаем: решение о нём принимается отдельно теми же кнопками рядом.
    /// </summary>
    [HttpPost("reviews/{id}/remove-avatar")]
    public async Task<IActionResult> RemoveAuthorAvatar(string id, CancellationToken ct = default)
    {
        var review = await _reviews.Find(r => r.Id == id).FirstOrDefaultAsync(ct);
        if (review is null)
        {
            return NotFound();
        }

        var removed = await _avatarStore.RemoveAsync(review.UserId, ct);
        _logger.LogInformation(
            "Аватар автора отзыва {ReviewId} (пользователь {UserId}) снят модератором: {Removed}.",
            id, review.UserId, removed);

        // removed = false значит «снимать было нечего» — для вызывающего это тот же успех:
        // аватара у человека теперь нет.
        return Ok(new { removed });
    }

    [HttpPost("reviews/{id}/publish")]
    public Task<IActionResult> Publish(string id) => SetReviewStatus(id, ReviewStatus.Published);

    [HttpPost("reviews/{id}/hide")]
    public Task<IActionResult> Hide(string id) => SetReviewStatus(id, ReviewStatus.Hidden);

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

