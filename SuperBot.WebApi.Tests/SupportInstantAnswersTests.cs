using SuperBot.WebApi.Support.Chat.Models;
using SuperBot.WebApi.Support.Chat.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Готовые ответы чата идут на языке диалога: у темы четыре текста (en/ru/uk/pl), и нет текста на
/// языке клиента — тема пропускается, чтобы модель ответила сама на его языке, а не шаблоном на чужом.
/// </summary>
public class SupportInstantAnswersTests
{
    private sealed class StoreStub : ISupportKnowledgeStore
    {
        private readonly IReadOnlyList<SupportKnowledgeArticle> _articles;
        public StoreStub(params SupportKnowledgeArticle[] articles) => _articles = articles;
        public Task<IReadOnlyList<SupportKnowledgeArticle>> GetActiveAsync() => Task.FromResult(_articles);
        public Task<IReadOnlyList<SupportKnowledgeArticle>> ListAllAsync() => Task.FromResult(_articles);
        public Task<SupportKnowledgeArticle?> GetAsync(string id) => Task.FromResult(_articles.FirstOrDefault(a => a.Id == id));
        public Task<SupportKnowledgeArticle> SaveAsync(SupportKnowledgeArticle article, string? editor) => Task.FromResult(article);
        public Task<bool> DeleteAsync(string id) => Task.FromResult(false);
        public Task SeedIfEmptyAsync() => Task.CompletedTask;
    }

    private static SupportKnowledgeArticle SeededArticle(string slug)
    {
        var article = SupportKnowledgeSeed.Build().First(item => item.Slug == slug);
        Assert.True(article.InstantEnabled);
        return article;
    }

    [Fact]
    public async Task Seeded_topics_answer_in_all_four_languages_and_recognise_each_language()
    {
        var answers = new SupportInstantAnswers(new StoreStub(SeededArticle("order-status")));

        var english = await answers.TryAnswerAsync("Where is my key?", "en", 40, 500);
        var russian = await answers.TryAnswerAsync("Где мой ключ?", "ru", 40, 500);
        var ukrainian = await answers.TryAnswerAsync("Де мій ключ?", "uk", 40, 500);
        var polish = await answers.TryAnswerAsync("Gdzie jest mój klucz?", "pl", 40, 500);

        Assert.Contains("Show key", english!.Text);
        Assert.Contains("Показать ключ", russian!.Text);
        Assert.Contains("Показати ключ", ukrainian!.Text);
        Assert.Contains("Pokaż klucz", polish!.Text);
        Assert.All(new[] { english, russian, ukrainian, polish }, answer => Assert.Equal("order-status", answer.Topic));
    }

    [Fact]
    public async Task Without_text_in_the_dialog_language_the_topic_is_left_to_the_model()
    {
        var article = new SupportKnowledgeArticle
        {
            Slug = "custom",
            InstantEnabled = true,
            InstantTriggers = new() { new InstantTriggerGroup { Terms = new() { "vpn" } } },
            InstantTextEn = "English only",
        };
        var answers = new SupportInstantAnswers(new StoreStub(article));

        Assert.NotNull(await answers.TryAnswerAsync("Does the VPN work?", "en", 40, 500));
        Assert.NotNull(await answers.TryAnswerAsync("Does the VPN work?", null, 40, 500));
        Assert.Null(await answers.TryAnswerAsync("Czy VPN działa?", "pl", 40, 500));
        Assert.Null(await answers.TryAnswerAsync("Чи працює VPN?", "uk", 40, 500));
    }

    [Fact]
    public void Backfill_runs_once_adds_only_uk_pl_seed_data_and_keeps_admin_edits()
    {
        // Статья, заведённая до появления uk/pl: отметки нет, английское слово админ убрал намеренно.
        var article = SeededArticle("refund-policy");
        article.TranslationsBackfilledAt = null;
        article.InstantTextUk = null;
        article.InstantTextPl = "Tekst admina";
        article.InstantTriggers[0].Terms.RemoveAll(term => term.StartsWith("zwr", StringComparison.Ordinal) || term == "refund");

        Assert.True(SupportKnowledgeSeed.BackfillTranslations(article));
        Assert.Contains("повернення", article.InstantTextUk);
        Assert.Equal("Tekst admina", article.InstantTextPl);
        Assert.Contains("zwrot", article.InstantTriggers[0].Terms);
        Assert.DoesNotContain("refund", article.InstantTriggers[0].Terms);
        Assert.NotNull(article.TranslationsBackfilledAt);

        // Отметка стоит — статью больше не трогаем, даже если админ снова стёр перевод.
        article.InstantTextUk = null;
        Assert.False(SupportKnowledgeSeed.BackfillTranslations(article));
        Assert.Null(article.InstantTextUk);
        Assert.False(SupportKnowledgeSeed.BackfillTranslations(new SupportKnowledgeArticle { Slug = "not-seeded", InstantEnabled = true }));
    }
}
