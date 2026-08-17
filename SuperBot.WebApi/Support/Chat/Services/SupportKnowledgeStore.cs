using Microsoft.Extensions.Caching.Memory;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Support.Chat.Models;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Единственный источник знаний чата. Читается на каждую реплику, поэтому держится в кэше;
/// правка из админки сбрасывает кэш сразу, а короткий срок жизни подстрахует, если
/// экземпляров сервиса окажется несколько.
/// </summary>
public interface ISupportKnowledgeStore
{
    /// <summary>Включённые темы для чата: и поиск по базе, и готовые ответы.</summary>
    Task<IReadOnlyList<SupportKnowledgeArticle>> GetActiveAsync();

    Task<IReadOnlyList<SupportKnowledgeArticle>> ListAllAsync();

    Task<SupportKnowledgeArticle?> GetAsync(string id);

    Task<SupportKnowledgeArticle> SaveAsync(SupportKnowledgeArticle article, string? editor);

    Task<bool> DeleteAsync(string id);

    /// <summary>Первый запуск: переносит темы из кода в базу, чтобы поведение не изменилось.</summary>
    Task SeedIfEmptyAsync();
}

public class SupportKnowledgeStore : ISupportKnowledgeStore
{
    private const string CacheKey = "support_knowledge_active";
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(2);

    private readonly IMongoCollection<SupportKnowledgeArticle> _articles;
    private readonly IMemoryCache _cache;
    private readonly ILogger<SupportKnowledgeStore> _logger;

    public SupportKnowledgeStore(IMongoDatabase database, IMemoryCache cache, ILogger<SupportKnowledgeStore> logger)
    {
        _articles = database.GetCollection<SupportKnowledgeArticle>("SupportKnowledgeArticles");
        _cache = cache;
        _logger = logger;
    }

    public async Task<IReadOnlyList<SupportKnowledgeArticle>> GetActiveAsync()
    {
        if (_cache.TryGetValue<IReadOnlyList<SupportKnowledgeArticle>>(CacheKey, out var cached) && cached != null)
        {
            return cached;
        }

        var items = await _articles
            .Find(article => article.Enabled)
            .SortBy(article => article.SortOrder)
            .ToListAsync();

        _cache.Set(CacheKey, (IReadOnlyList<SupportKnowledgeArticle>)items, CacheLifetime);
        return items;
    }

    public async Task<IReadOnlyList<SupportKnowledgeArticle>> ListAllAsync() =>
        await _articles.Find(FilterDefinition<SupportKnowledgeArticle>.Empty)
            .SortBy(article => article.SortOrder)
            .ToListAsync();

    public async Task<SupportKnowledgeArticle?> GetAsync(string id)
    {
        if (!ObjectId.TryParse(id, out _))
        {
            return null;
        }

        return await _articles.Find(article => article.Id == id).FirstOrDefaultAsync();
    }

    public async Task<SupportKnowledgeArticle> SaveAsync(SupportKnowledgeArticle article, string? editor)
    {
        article.UpdatedAt = DateTime.UtcNow;
        article.UpdatedBy = editor;
        article.Slug = string.IsNullOrWhiteSpace(article.Slug) ? Slugify(article.Title) : article.Slug.Trim();

        if (string.IsNullOrWhiteSpace(article.Id))
        {
            await _articles.InsertOneAsync(article);
        }
        else
        {
            await _articles.ReplaceOneAsync(existing => existing.Id == article.Id, article);
        }

        _cache.Remove(CacheKey);
        return article;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        if (!ObjectId.TryParse(id, out _))
        {
            return false;
        }

        var result = await _articles.DeleteOneAsync(article => article.Id == id);
        _cache.Remove(CacheKey);
        return result.DeletedCount > 0;
    }

    public async Task SeedIfEmptyAsync()
    {
        if (await _articles.CountDocumentsAsync(FilterDefinition<SupportKnowledgeArticle>.Empty) > 0)
        {
            return;
        }

        var seed = SupportKnowledgeSeed.Build();
        if (seed.Count == 0)
        {
            return;
        }

        await _articles.InsertManyAsync(seed);
        _cache.Remove(CacheKey);
        _logger.LogInformation("Seeded {Count} support knowledge articles from code.", seed.Count);
    }

    private static string Slugify(string title)
    {
        var chars = title.Trim().ToLowerInvariant()
            .Select(symbol => char.IsLetterOrDigit(symbol) ? symbol : '-')
            .ToArray();
        var slug = new string(chars).Trim('-');
        while (slug.Contains("--", StringComparison.Ordinal))
        {
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        }

        return slug.Length == 0 ? Guid.NewGuid().ToString("n")[..8] : slug;
    }
}
