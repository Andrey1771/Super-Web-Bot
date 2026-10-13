using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Модерация комментариев блога: общий список (включая скрытые), скрытие/показ, удаление.
/// </summary>
[ApiController]
[Route("api/admin/blog/comments")]
[Authorize(Roles = "admin")]
public class AdminBlogCommentsController : ControllerBase
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    private readonly IBlogCommentRepository _comments;
    private readonly IBlogRepository _posts;

    public AdminBlogCommentsController(IBlogCommentRepository comments, IBlogRepository posts)
    {
        _comments = comments;
        _posts = posts;
    }

    [HttpGet]
    public async Task<IActionResult> GetComments(
        [FromQuery] string status = "",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (!string.IsNullOrEmpty(status) &&
            !string.Equals(status, BlogCommentStatus.Visible, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(status, BlogCommentStatus.Hidden, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Unknown status filter.");
        }

        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var items = await _comments.GetPagedAsync((safePage - 1) * safePageSize, safePageSize, string.IsNullOrEmpty(status) ? null : status);
        var total = await _comments.CountAsync(string.IsNullOrEmpty(status) ? null : status);

        // Название и slug поста — чтобы модератор видел контекст без второго запроса.
        var postIds = items.Select(item => item.PostId).Distinct().ToList();
        var posts = await _posts.GetByIdsAsync(postIds);
        var postsById = posts.ToDictionary(post => post.Id, StringComparer.OrdinalIgnoreCase);
        var bannedUserIds = await _comments.GetBannedUserIdsAsync(items.Select(item => item.UserId));

        return Ok(new
        {
            items = items.Select(item => new
            {
                id = item.Id,
                postId = item.PostId,
                postTitle = postsById.TryGetValue(item.PostId, out var post) ? post.Title : "(deleted post)",
                postSlug = postsById.TryGetValue(item.PostId, out post) ? post.Slug : null,
                authorName = item.AuthorName,
                // Админу видно, гость это или пользователь — спам-паттерны так заметнее.
                isGuest = string.IsNullOrWhiteSpace(item.UserId),
                authorBanned = !string.IsNullOrWhiteSpace(item.UserId) && bannedUserIds.Contains(item.UserId),
                text = item.Text,
                status = string.IsNullOrWhiteSpace(item.Status) ? BlogCommentStatus.Visible : item.Status,
                createdAt = item.CreatedAt
            }),
            total
        });
    }

    /// <summary>Забанить автора комментария: новые комментарии от него не принимаются.</summary>
    [HttpPost("{id}/ban-author")]
    public async Task<IActionResult> BanAuthor(string id)
    {
        var comment = await _comments.GetByIdAsync(id);
        if (comment == null)
        {
            return NotFound("Comment not found.");
        }

        // Старые гостевые комментарии (до обязательной авторизации) банить не по чему.
        if (string.IsNullOrWhiteSpace(comment.UserId))
        {
            return BadRequest("This comment was left by a guest — there is no account to ban.");
        }

        await _comments.BanAuthorAsync(comment.UserId, GetModeratorId());
        return Ok(new { userId = comment.UserId, banned = true });
    }

    [HttpPost("{id}/unban-author")]
    public async Task<IActionResult> UnbanAuthor(string id)
    {
        var comment = await _comments.GetByIdAsync(id);
        if (comment == null)
        {
            return NotFound("Comment not found.");
        }

        if (string.IsNullOrWhiteSpace(comment.UserId))
        {
            return BadRequest("This comment was left by a guest — there is no account to unban.");
        }

        var removed = await _comments.UnbanAuthorAsync(comment.UserId);
        return Ok(new { userId = comment.UserId, banned = !removed && await _comments.IsAuthorBannedAsync(comment.UserId) });
    }

    private string GetModeratorId()
    {
        return User?.FindFirst("email")?.Value
               ?? User?.FindFirst("preferred_username")?.Value
               ?? User?.FindFirst("sub")?.Value
               ?? "admin";
    }

    [HttpPost("{id}/status")]
    public async Task<IActionResult> SetStatus(string id, [FromBody] BlogCommentStatusRequest request)
    {
        var status = request?.Status?.Trim();
        var normalized = string.Equals(status, BlogCommentStatus.Hidden, StringComparison.OrdinalIgnoreCase)
            ? BlogCommentStatus.Hidden
            : string.Equals(status, BlogCommentStatus.Visible, StringComparison.OrdinalIgnoreCase)
                ? BlogCommentStatus.Visible
                : null;

        if (normalized == null)
        {
            return BadRequest("Status must be Visible or Hidden.");
        }

        var updated = await _comments.SetStatusAsync(id, normalized);
        return updated ? Ok(new { id, status = normalized }) : NotFound("Comment not found.");
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var deleted = await _comments.DeleteAsync(id);
        return deleted ? Ok(new { id, deleted = true }) : NotFound("Comment not found.");
    }
}

public class BlogCommentStatusRequest
{
    public string? Status { get; set; }
}
