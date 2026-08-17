using SuperBot.WebApi.Support.Chat.Models;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Перенос тем из кода в базу при первом запуске. Списки в коде остаются только как исходные
/// данные для этого переноса — на каждую реплику чат читает уже базу, и правит её админка.
/// </summary>
public static class SupportKnowledgeSeed
{
    // Какая статья получает готовый ответ соответствующей темы.
    private static readonly (string TopicId, string ArticleSlug)[] InstantMapping =
    {
        ("key_delivery", "order-status"),
        ("activation", "activation-guide"),
        ("refund", "refund-policy"),
        ("payment", "payment-methods"),
        ("account_recovery", "account-recovery")
    };

    public static List<SupportKnowledgeArticle> Build()
    {
        var now = DateTime.UtcNow;
        var articles = SupportKnowledgeBase.SeedArticles
            .Select((source, index) => new SupportKnowledgeArticle
            {
                Slug = source.Id,
                Title = source.Title,
                Category = source.Category,
                Keywords = source.Keywords.ToList(),
                Content = source.Content,
                Enabled = true,
                SortOrder = index,
                UpdatedAt = now,
                UpdatedBy = "seed"
            })
            .ToList();

        foreach (var (topicId, articleSlug) in InstantMapping)
        {
            var topic = SupportInstantAnswers.SeedTopics.FirstOrDefault(item => item.Id == topicId);
            var article = articles.FirstOrDefault(item => item.Slug == articleSlug);
            if (topic == null || article == null)
            {
                continue;
            }

            article.InstantEnabled = true;
            article.InstantTriggers = topic.Groups
                .Select(group => new InstantTriggerGroup { Terms = group.ToList() })
                .ToList();
            article.InstantTextRu = topic.TextRu;
            article.InstantTextEn = topic.TextEn;
        }

        return articles;
    }
}
