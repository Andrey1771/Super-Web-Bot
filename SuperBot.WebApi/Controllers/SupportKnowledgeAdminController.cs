using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Support.Chat.Dto;
using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Chat.Services;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Правка тем поддержки: то, чем чат отвечает и на что опирается модель. Раньше это лежало
/// в коде, и добавить ответ на новый частый вопрос можно было только выкладкой.
/// </summary>
[ApiController]
[Route("api/support/admin/knowledge")]
[Authorize(Policy = "SupportAgent")]
public class SupportKnowledgeAdminController : ControllerBase
{
    private readonly ISupportKnowledgeStore _store;

    public SupportKnowledgeAdminController(ISupportKnowledgeStore store)
    {
        _store = store;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SupportKnowledgeArticleDto>>> List()
    {
        var items = await _store.ListAllAsync();
        return Ok(items.Select(Map).ToList());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SupportKnowledgeArticleDto>> Get([FromRoute] string id)
    {
        var article = await _store.GetAsync(id);
        return article == null ? NotFound() : Ok(Map(article));
    }

    [HttpPost]
    public async Task<ActionResult<SupportKnowledgeArticleDto>> Create([FromBody] SupportKnowledgeArticleDto request)
    {
        var error = Validate(request);
        if (error != null)
        {
            return Problem(error, statusCode: StatusCodes.Status400BadRequest);
        }

        var saved = await _store.SaveAsync(FromDto(request, new SupportKnowledgeArticle()), CurrentEditor());
        return Ok(Map(saved));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SupportKnowledgeArticleDto>> Update(
        [FromRoute] string id,
        [FromBody] SupportKnowledgeArticleDto request)
    {
        var existing = await _store.GetAsync(id);
        if (existing == null)
        {
            return NotFound();
        }

        var error = Validate(request);
        if (error != null)
        {
            return Problem(error, statusCode: StatusCodes.Status400BadRequest);
        }

        var saved = await _store.SaveAsync(FromDto(request, existing), CurrentEditor());
        return Ok(Map(saved));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete([FromRoute] string id)
    {
        var removed = await _store.DeleteAsync(id);
        return removed ? NoContent() : NotFound();
    }

    private string? CurrentEditor() => SupportUserContext.FromClaims(User).DisplayName;

    /// <summary>
    /// Тема без текста для модели бесполезна, а «мгновенный» ответ без слов-триггеров или
    /// без самого текста никогда не сработает — такое лучше не сохранять молча.
    /// </summary>
    private static string? Validate(SupportKnowledgeArticleDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return "Title is required.";
        }

        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return "Content is required — it is what the model answers from.";
        }

        if (!request.InstantEnabled)
        {
            return null;
        }

        var groups = (request.InstantTriggers ?? new List<List<string>>())
            .Select(group => group.Where(term => !string.IsNullOrWhiteSpace(term)).ToList())
            .Where(group => group.Count > 0)
            .ToList();

        if (groups.Count == 0)
        {
            return "An instant answer needs at least one group of trigger words.";
        }

        if (string.IsNullOrWhiteSpace(request.InstantTextRu) && string.IsNullOrWhiteSpace(request.InstantTextEn))
        {
            return "An instant answer needs text in at least one language.";
        }

        return null;
    }

    private static SupportKnowledgeArticle FromDto(SupportKnowledgeArticleDto request, SupportKnowledgeArticle target)
    {
        target.Slug = request.Slug?.Trim() ?? string.Empty;
        target.Title = request.Title.Trim();
        target.Category = request.Category?.Trim() ?? string.Empty;
        target.Keywords = (request.Keywords ?? new List<string>())
            .Select(keyword => keyword.Trim().ToLowerInvariant())
            .Where(keyword => keyword.Length > 0)
            .Distinct()
            .ToList();
        target.Content = request.Content.Trim();
        target.Enabled = request.Enabled;
        target.SortOrder = request.SortOrder;
        target.InstantEnabled = request.InstantEnabled;
        target.InstantTriggers = (request.InstantTriggers ?? new List<List<string>>())
            .Select(group => new InstantTriggerGroup
            {
                Terms = group.Select(term => term.Trim().ToLowerInvariant())
                    .Where(term => term.Length > 0)
                    .Distinct()
                    .ToList()
            })
            .Where(group => group.Terms.Count > 0)
            .ToList();
        target.InstantTextRu = string.IsNullOrWhiteSpace(request.InstantTextRu) ? null : request.InstantTextRu.Trim();
        target.InstantTextEn = string.IsNullOrWhiteSpace(request.InstantTextEn) ? null : request.InstantTextEn.Trim();
        return target;
    }

    private static SupportKnowledgeArticleDto Map(SupportKnowledgeArticle article) => new()
    {
        Id = article.Id,
        Slug = article.Slug,
        Title = article.Title,
        Category = article.Category,
        Keywords = article.Keywords,
        Content = article.Content,
        Enabled = article.Enabled,
        SortOrder = article.SortOrder,
        InstantEnabled = article.InstantEnabled,
        InstantTriggers = article.InstantTriggers.Select(group => group.Terms).ToList(),
        InstantTextRu = article.InstantTextRu,
        InstantTextEn = article.InstantTextEn,
        UpdatedAt = article.UpdatedAt,
        UpdatedBy = article.UpdatedBy
    };
}
