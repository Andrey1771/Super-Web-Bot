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
                .Select((group, index) => new InstantTriggerGroup
                {
                    Terms = group.Concat(topic.ExtraGroups[index]).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                })
                .ToList();
            article.TranslationsBackfilledAt = now;
            article.InstantTextRu = topic.TextRu;
            article.InstantTextEn = topic.TextEn;
            article.InstantTextUk = topic.TextUk;
            article.InstantTextPl = topic.TextPl;
        }

        return articles;
    }

    /// <summary>
    /// Украинский и польский появились позже первого переноса: уже заведённой статье один раз дописываем
    /// пустые uk/pl тексты и только новые uk/pl слова-триггеры (по группам, если их структура совпадает
    /// с сидом). Английские и русские слова не трогаем, как и тексты админа. Статья получает отметку
    /// <see cref="SupportKnowledgeArticle.TranslationsBackfilledAt"/> и больше не пересматривается.
    /// Возвращает true, если статью надо сохранить.
    /// </summary>
    public static bool BackfillTranslations(SupportKnowledgeArticle article)
    {
        if (article.TranslationsBackfilledAt is not null)
        {
            return false;
        }
        var mapping = InstantMapping.FirstOrDefault(item => item.ArticleSlug == article.Slug);
        var topic = mapping.TopicId is null ? null : SupportInstantAnswers.SeedTopics.FirstOrDefault(item => item.Id == mapping.TopicId);
        if (topic == null)
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(article.InstantTextUk))
        {
            article.InstantTextUk = topic.TextUk;
        }
        if (string.IsNullOrWhiteSpace(article.InstantTextPl))
        {
            article.InstantTextPl = topic.TextPl;
        }
        if (article.InstantTriggers.Count == topic.ExtraGroups.Length)
        {
            for (var i = 0; i < topic.ExtraGroups.Length; i++)
            {
                var group = article.InstantTriggers[i];
                group.Terms.AddRange(topic.ExtraGroups[i].Where(term => !group.Terms.Contains(term, StringComparer.OrdinalIgnoreCase)));
            }
        }
        article.TranslationsBackfilledAt = DateTime.UtcNow;
        return true;
    }
}
