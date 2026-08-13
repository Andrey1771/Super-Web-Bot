using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/blog/comments")]
public class BlogCommentsController : ControllerBase
{
    // Как у конкурентов: длинные простыни режем на уровне API, а не только в форме.
    public const int MaxTextLength = 2000;
    public const int MaxAuthorNameLength = 60;
    // Заслон от заливки спамом: больше N комментариев за окно — 429. Ключ — anonId/userId;
    // anonId генерирует клиент, так что от целенаправленной атаки это не защита,
    // но случайный флуд и залипшую кнопку останавливает.
    public const int RateLimitMaxComments = 5;
    public const int RateLimitWindowMinutes = 10;
    private const int DefaultPageSize = 10;
    private const int MaxPageSize = 50;
    private const string FallbackAuthorName = "User";

    private readonly IBlogCommentRepository _comments;
    private readonly IBlogRepository _posts;

    public BlogCommentsController(IBlogCommentRepository comments, IBlogRepository posts)
    {
        _comments = comments;
        _posts = posts;
    }

    [HttpGet]
    public async Task<IActionResult> GetComments(
        [FromQuery] string postId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (string.IsNullOrWhiteSpace(postId))
        {
            return BadRequest("PostId is required.");
        }

        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var items = await _comments.GetByPostAsync(postId, (safePage - 1) * safePageSize, safePageSize);
        var total = await _comments.CountByPostAsync(postId);

        return Ok(new
        {
            // anonId/userId — служебные, наружу не отдаём.
            items = items.Select(item => new
            {
                id = item.Id,
                authorName = item.AuthorName,
                text = item.Text,
                createdAt = item.CreatedAt
            }),
            total
        });
    }

    // Комментируют только залогиненные: имя берётся из профиля, а не из поля формы,
    // и подделать чужую подпись гостю нельзя.
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] BlogCommentRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.PostId))
        {
            return BadRequest("PostId is required.");
        }

        var text = request.Text?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest("Comment text is required.");
        }

        if (text.Length > MaxTextLength)
        {
            return BadRequest($"Comment is too long: {MaxTextLength} characters max.");
        }

        var post = await _posts.GetByIdAsync(request.PostId);
        if (post == null)
        {
            return NotFound("Post not found.");
        }

        var userId = GetCurrentUserId();

        // Бан проверяем раньше rate-limit: забаненному бессмысленно сообщать про паузу.
        if (await _comments.IsAuthorBannedAsync(userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Commenting is disabled for your account.");
        }

        var anonId = request.AnonId?.Trim() ?? string.Empty;
        var windowStart = DateTime.UtcNow.AddMinutes(-RateLimitWindowMinutes);
        var recentCount = await _comments.CountRecentByActorAsync(userId, anonId, windowStart);
        if (recentCount >= RateLimitMaxComments)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests,
                $"Too many comments. Please wait a few minutes and try again.");
        }

        var authorName = GetDisplayName();

        var comment = new BlogComment
        {
            PostId = request.PostId,
            UserId = userId,
            AnonId = anonId,
            AuthorName = authorName,
            Text = text,
            Status = BlogCommentStatus.Visible,
            CreatedAt = DateTime.UtcNow
        };

        await _comments.CreateAsync(comment);

        return Ok(new
        {
            id = comment.Id,
            authorName = comment.AuthorName,
            text = comment.Text,
            createdAt = comment.CreatedAt
        });
    }

    private string GetCurrentUserId()
    {
        return User?.FindFirst("email")?.Value
               ?? User?.FindFirst(ClaimTypes.Email)?.Value
               ?? User?.FindFirst("preferred_username")?.Value
               ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User?.FindFirst("sub")?.Value
               ?? string.Empty;
    }

    /// <summary>
    /// Публичная подпись комментария — ник из профиля Keycloak. Почта в открытую
    /// ленту попадать не должна: если кандидат похож на email, берём часть до «@».
    /// </summary>
    private string GetDisplayName()
    {
        var candidate = User?.FindFirst("preferred_username")?.Value
                        ?? User?.FindFirst("name")?.Value
                        ?? User?.FindFirst(ClaimTypes.Name)?.Value
                        ?? User?.FindFirst("email")?.Value
                        ?? User?.FindFirst(ClaimTypes.Email)?.Value
                        ?? string.Empty;

        var atIndex = candidate.IndexOf('@');
        if (atIndex > 0)
        {
            candidate = candidate[..atIndex];
        }

        candidate = candidate.Trim();
        if (candidate.Length > MaxAuthorNameLength)
        {
            candidate = candidate[..MaxAuthorNameLength];
        }

        return string.IsNullOrWhiteSpace(candidate) ? FallbackAuthorName : candidate;
    }
}

// Поля nullable намеренно: [ApiController] с включённым NRT считает non-nullable
// string обязательным и режет запрос 400-кой ещё до нашей валидации.
public class BlogCommentRequest
{
    public string? PostId { get; set; }
    public string? AnonId { get; set; }
    public string? Text { get; set; }
}
