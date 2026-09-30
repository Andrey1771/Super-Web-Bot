using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Тексты карточки товара, введённые админом, показываются покупателю на языке сайта: переводы лежат
/// рядом с английским полем (*I18n), витрина получает подставленный текст, админка — всё как есть.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ProductLocalizationTests
{
    private readonly TaleShopApiFactory _factory;

    public ProductLocalizationTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private HttpClient Buyer(string? language)
    {
        var client = _factory.CreateClient();
        if (language is not null)
        {
            client.DefaultRequestHeaders.Add("Accept-Language", language);
        }
        return client;
    }

    [Fact]
    public async Task Product_texts_follow_the_buyer_language_and_stay_english_for_the_admin()
    {
        var admin = Admin();
        var name = $"Localized Quest {Guid.NewGuid():N}";
        var slug = $"lq-{Guid.NewGuid():N}"[..20];
        string? gameId = null;
        try
        {
            var created = await admin.PostAsJsonAsync("/api/game",
                new { name, title = name, slug, description = "Explore a hand-drawn world.", price = 9m, imagePath = "cover.png", genre = "action" });
            created.EnsureSuccessStatusCode();
            gameId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

            // Переводы описания карточки каталога и текстов страницы товара — через обычные админские маршруты.
            (await admin.PutAsJsonAsync($"/api/game/{gameId}", new { descriptionI18n = new Dictionary<string, string> { ["ru"] = "Исследуйте нарисованный от руки мир.", ["de"] = "ignored", ["pl"] = "  " } }))
                .EnsureSuccessStatusCode();
            var details = new GameDetails
            {
                Slug = slug,
                Title = name,
                Tagline = "A cozy adventure",
                TaglineI18n = new() { ["ru"] = "Уютное приключение", ["uk"] = "Затишна пригода" },
                DescriptionMarkdown = "Long **english** text",
                DescriptionMarkdownI18n = new() { ["ru"] = "Длинный **русский** текст" },
                KeyFeatures = new() { "Hand-drawn art", "Original soundtrack" },
                KeyFeaturesI18n = new() { ["ru"] = new() { "Рисованная графика", "Оригинальный саундтрек" } },
                Genres = new() { "Adventure", "Puzzle" },
                // Лишний третий перевод отбрасывается, пустой второй — без перевода (английское значение).
                GenresI18n = new() { ["ru"] = new() { "Приключение", "", "лишнее" } },
                Tags = new() { "co-op", "story-rich" },
                TagsI18n = new() { ["ru"] = new() { "кооператив", "сюжетная" } },
                AgeRating = new GameAgeRating { System = "PEGI", Label = "12", LabelI18n = new() { ["ru"] = "12+" } },
                Editions = new()
                {
                    new GameEdition { Code = "std", Title = "Standard", TitleI18n = new() { ["ru"] = "Стандартное" }, Description = "The game", DescriptionI18n = new() { ["ru"] = "Игра" }, Price = 9m, IsDefault = true }
                },
                Awards = new() { new GameAwardBadge { Title = "Best indie", TitleI18n = new() { ["ru"] = "Лучшая инди" }, Year = 2025 } },
                SystemRequirements = new GameSystemRequirements
                {
                    Windows = new GameSystemRequirementBlock { Minimum = new GameSystemRequirementSpec { Os = "Windows 10", Notes = "Controller recommended", NotesI18n = new() { ["ru"] = "Рекомендуется контроллер", ["en"] = "ignored" } } }
                }
            };
            (await admin.PutAsJsonAsync($"/api/admin/games/{gameId}/details", details)).EnsureSuccessStatusCode();

            // Русский покупатель.
            var russian = await (await Buyer("ru").GetAsync($"/api/games/{slug}")).Content.ReadFromJsonAsync<JsonElement>();
            var game = russian.GetProperty("game");
            Assert.Equal("Уютное приключение", game.GetProperty("tagline").GetString());
            Assert.Equal("Длинный **русский** текст", game.GetProperty("descriptionMarkdown").GetString());
            Assert.Equal("Рисованная графика", game.GetProperty("keyFeatures")[0].GetString());
            Assert.Equal("12+", game.GetProperty("ageRating").GetProperty("label").GetString());
            Assert.Equal("Стандартное", game.GetProperty("editions")[0].GetProperty("title").GetString());
            Assert.Equal("Лучшая инди", game.GetProperty("awards")[0].GetProperty("title").GetString());
            Assert.Equal("Рекомендуется контроллер", game.GetProperty("systemRequirements").GetProperty("windows").GetProperty("minimum").GetProperty("notes").GetString());
            // Жанры и теги: значения английские (ссылки, фильтры), подписи — по позициям на языке покупателя.
            Assert.Equal(new[] { "Adventure", "Puzzle" }, game.GetProperty("genres").EnumerateArray().Select(x => x.GetString()));
            Assert.Equal(new[] { "Приключение", "Puzzle" }, russian.GetProperty("genreLabels").EnumerateArray().Select(x => x.GetString()));
            Assert.Equal(new[] { "кооператив", "сюжетная" }, russian.GetProperty("tagLabels").EnumerateArray().Select(x => x.GetString()));

            // Украинский: перевод есть только у подзаголовка, остальное — английское.
            var ukrainian = (await (await Buyer("uk").GetAsync($"/api/games/{slug}")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("game");
            Assert.Equal("Затишна пригода", ukrainian.GetProperty("tagline").GetString());
            Assert.Equal("Long **english** text", ukrainian.GetProperty("descriptionMarkdown").GetString());

            // Без языка — английское.
            var plain = (await (await Buyer(null).GetAsync($"/api/games/{slug}")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("game");
            Assert.Equal("A cozy adventure", plain.GetProperty("tagline").GetString());

            // Карточка каталога: описание переведено для русского, а список админки (с черновиками) — английский.
            var q = Uri.EscapeDataString(name);
            var ruCard = Assert.Single((await (await Buyer("ru").GetAsync($"/api/game/catalog?q={q}")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray());
            Assert.Equal("Исследуйте нарисованный от руки мир.", ruCard.GetProperty("description").GetString());
            Assert.Equal(new[] { "Приключение", "Puzzle" }, ruCard.GetProperty("genres").EnumerateArray().Select(x => x.GetString()));
            var adminRu = Admin();
            adminRu.DefaultRequestHeaders.Add("Accept-Language", "ru");
            var adminCard = Assert.Single((await (await adminRu.GetAsync($"/api/game/catalog?q={q}&includeDrafts=true")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray());
            Assert.Equal("Explore a hand-drawn world.", adminCard.GetProperty("description").GetString());

            // Админка читает карточку как есть: английское поле и словарь переводов без мусора («de», пустые).
            var stored = await (await adminRu.GetAsync($"/api/admin/games/{gameId}/details")).Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("A cozy adventure", stored.GetProperty("tagline").GetString());
            Assert.Equal("Уютное приключение", stored.GetProperty("taglineI18n").GetProperty("ru").GetString());
            var notes = stored.GetProperty("systemRequirements").GetProperty("windows").GetProperty("minimum").GetProperty("notesI18n");
            Assert.False(notes.TryGetProperty("en", out _));
            Assert.Equal(2, stored.GetProperty("genresI18n").GetProperty("ru").GetArrayLength());
            using var scope = _factory.Services.CreateScope();
            var storedGame = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(gameId!);
            Assert.Equal(new[] { "ru" }, storedGame!.DescriptionI18n!.Keys.OrderBy(key => key));
        }
        finally
        {
            using var scope = _factory.Services.CreateScope();
            if (gameId is not null)
            {
                await scope.ServiceProvider.GetRequiredService<IGameRepository>().DeleteAsync(gameId);
                scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>().Invalidate();
            }
        }
    }
}
