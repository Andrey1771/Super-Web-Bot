using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Жанры игр — список в настройках, а не перечисление в коде: админка добавляет и переименовывает жанры, адрес страницы
/// жанра при переименовании не меняется, жанр с играми удалить нельзя, а старые документы переезжают сами.
/// Тесты меняют общий список жанров и возвращают его на место.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class GameGenresTests
{
    private readonly TaleShopApiFactory _factory;

    public GameGenresTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<List<(string Tag, string Title)>> GenresAsync(HttpClient admin) =>
        (await (await admin.GetAsync("/api/admin/genres")).Content.ReadFromJsonAsync<JsonElement>())
            .EnumerateArray()
            .Select(genre => (genre.GetProperty("tag").GetString()!, genre.GetProperty("title").GetString()!))
            .ToList();

    private static Task<HttpResponseMessage> SaveAsync(HttpClient admin, IEnumerable<(string Tag, string Title)> genres) =>
        admin.PutAsJsonAsync("/api/admin/genres", genres.Select(genre => new { tag = genre.Tag, title = genre.Title }));

    private async Task<JsonElement> CatalogAsync(string query) =>
        await (await _factory.CreateClient().GetAsync($"/api/game/catalog?{query}")).Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Genre_names_follow_the_buyer_language_while_filters_keep_the_english_value()
    {
        // Админ переводит жанр; покупатель с русским языком видит перевод в карточке, фасете и списке жанров,
        // а значение фильтра и адрес остаются английскими — старые ссылки и галочки не ломаются.
        var admin = Admin();
        var original = await GenresAsync(admin);
        var name = $"Localized Loop {Guid.NewGuid():N}";
        string? gameId = null;
        try
        {
            var payload = original
                .Select(genre => new { tag = genre.Tag, title = genre.Title, titles = (Dictionary<string, string>?)null })
                .Append(new { tag = "roguelike-l10n", title = "Roguelike", titles = (Dictionary<string, string>?)new() { ["ru"] = "Рогалики", ["pl"] = "Roguelike PL", ["de"] = "ignored", ["en"] = "ignored" } })
                .ToList();
            (await admin.PutAsJsonAsync("/api/admin/genres", payload)).EnsureSuccessStatusCode();

            var saved = (await (await admin.GetAsync("/api/admin/genres")).Content.ReadFromJsonAsync<JsonElement>())
                .EnumerateArray().Single(genre => genre.GetProperty("tag").GetString() == "roguelike-l10n");
            Assert.Equal("Рогалики", saved.GetProperty("titles").GetProperty("ru").GetString());
            Assert.False(saved.GetProperty("titles").TryGetProperty("de", out _));

            var created = await admin.PostAsJsonAsync("/api/game",
                new { name, title = name, slug = $"l10n-{Guid.NewGuid():N}", description = "desc", price = 9m, imagePath = "cover.png", genre = "roguelike-l10n" });
            created.EnsureSuccessStatusCode();
            gameId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

            var russian = _factory.CreateClient();
            russian.DefaultRequestHeaders.Add("Accept-Language", "ru");
            var q = Uri.EscapeDataString(name);
            var page = await (await russian.GetAsync($"/api/game/catalog?q={q}")).Content.ReadFromJsonAsync<JsonElement>();
            var card = Assert.Single(page.GetProperty("items").EnumerateArray());
            Assert.Equal("Рогалики", card.GetProperty("category").GetString());
            Assert.Equal("Рогалики", card.GetProperty("genres")[0].GetString());
            var facet = page.GetProperty("facets").GetProperty("categories").EnumerateArray().Single(item => item.GetProperty("value").GetString() == "Roguelike");
            Assert.Equal("Рогалики", facet.GetProperty("label").GetString());

            // Без перевода на язык — английское; без языка — тоже английское.
            var ukrainian = _factory.CreateClient();
            ukrainian.DefaultRequestHeaders.Add("Accept-Language", "uk");
            Assert.Equal("Roguelike", Assert.Single((await (await ukrainian.GetAsync($"/api/game/catalog?q={q}")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray()).GetProperty("category").GetString());
            Assert.Equal("Roguelike", Assert.Single((await CatalogAsync($"q={q}")).GetProperty("items").EnumerateArray()).GetProperty("category").GetString());

            var genres = (await (await russian.GetAsync("/api/game/genres")).Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray()
                .Single(genre => genre.GetProperty("tag").GetString() == "roguelike-l10n");
            Assert.Equal("Roguelike", genres.GetProperty("title").GetString());
            Assert.Equal("Рогалики", genres.GetProperty("label").GetString());
        }
        finally
        {
            using var scope = _factory.Services.CreateScope();
            if (gameId is not null)
            {
                await scope.ServiceProvider.GetRequiredService<IGameRepository>().DeleteAsync(gameId);
                scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>().Invalidate();
            }
            (await SaveAsync(admin, original)).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Admin_adds_and_renames_a_genre_while_its_address_keeps_working()
    {
        var admin = Admin();
        var original = await GenresAsync(admin);
        var name = $"Dungeon Loop {Guid.NewGuid():N}";
        string? gameId = null;
        try
        {
            Assert.Contains(original, genre => genre.Tag == "action");

            (await SaveAsync(admin, original.Append(("roguelike", "Roguelike")))).EnsureSuccessStatusCode();

            var created = await admin.PostAsJsonAsync("/api/game",
                new { name, title = name, slug = $"dungeon-{Guid.NewGuid():N}", description = "desc", price = 9m, imagePath = "cover.png", genre = "roguelike" });
            created.EnsureSuccessStatusCode();
            gameId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

            var q = Uri.EscapeDataString(name);
            var card = Assert.Single((await CatalogAsync($"q={q}")).GetProperty("items").EnumerateArray());
            Assert.Equal("roguelike", card.GetProperty("genre").GetString());
            Assert.Equal("Roguelike", card.GetProperty("category").GetString());

            // Переименовали — название новое, а страница жанра открывается по прежнему адресу.
            (await SaveAsync(admin, original.Append(("roguelike", "Roguelites")))).EnsureSuccessStatusCode();
            var renamed = Assert.Single((await CatalogAsync($"q={q}")).GetProperty("items").EnumerateArray());
            Assert.Equal("Roguelites", renamed.GetProperty("category").GetString());
            Assert.Equal(1, (await CatalogAsync($"categorySlug=roguelike&q={q}")).GetProperty("total").GetInt32());
            Assert.Equal(1, (await CatalogAsync($"categorySlug=roguelites&q={q}")).GetProperty("total").GetInt32());

            var publicGenres = (await (await _factory.CreateClient().GetAsync("/api/game/genres")).Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
            Assert.Contains(publicGenres, genre => genre.GetProperty("tag").GetString() == "roguelike" && genre.GetProperty("count").GetInt32() >= 1);

            // Жанр с игрой удалить нельзя, а жанра не из списка у игры быть не может.
            Assert.Equal(HttpStatusCode.Conflict, (await SaveAsync(admin, original)).StatusCode);
            var unknown = await admin.PostAsJsonAsync("/api/game",
                new { name = $"{name} 2", title = $"{name} 2", slug = $"dungeon-{Guid.NewGuid():N}", description = "desc", price = 9m, imagePath = "cover.png", genre = "no-such-genre" });
            Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);

            // Старый клиент шлёт только номер — жанр выводится из него.
            var legacyName = $"Legacy Client {Guid.NewGuid():N}";
            (await admin.PostAsJsonAsync("/api/game",
                new { name = legacyName, title = legacyName, slug = $"legacy-{Guid.NewGuid():N}", description = "desc", price = 9m, imagePath = "cover.png", gameType = (int)GameType.RolePlayingGames }))
                .EnsureSuccessStatusCode();
            var legacyCard = Assert.Single((await CatalogAsync($"q={Uri.EscapeDataString(legacyName)}")).GetProperty("items").EnumerateArray());
            Assert.Equal("role-playing-games-rpgs", legacyCard.GetProperty("genre").GetString());
        }
        finally
        {
            using var scope = _factory.Services.CreateScope();
            if (gameId is not null)
            {
                await scope.ServiceProvider.GetRequiredService<IGameRepository>().DeleteAsync(gameId);
                scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>().Invalidate();
            }
            (await SaveAsync(admin, original)).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Initializer_moves_numbered_genres_to_addresses_and_keeps_a_renamed_title()
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var settings = database.GetCollection<BsonDocument>("Settings");
        var games = database.GetCollection<BsonDocument>("Games");
        var stored = await settings.Find(FilterDefinition<BsonDocument>.Empty).FirstAsync();
        var originalGenres = stored["GameCategories"];

        // Настройки до переезда: коды — имена перечисления, а RPG когда-то переименовали.
        var legacy = new BsonArray(Enum.GetValues<GameType>().Select(type => new BsonDocument
        {
            { "Tag", type.ToString() },
            { "Title", type == GameType.RolePlayingGames ? "RPG" : GameTypeMapper.DescriptionsCategories[type] }
        }));
        var gameId = ObjectId.GenerateNewId();
        try
        {
            await settings.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", stored["_id"]), Builders<BsonDocument>.Update.Set("GameCategories", legacy));
            await games.InsertOneAsync(new BsonDocument
            {
                { "_id", gameId },
                { "name", "Old RPG" },
                { "title", "Old RPG" },
                { "slug", $"old-rpg-{gameId}" },
                { "price", 10.0 },
                { "gameType", (int)GameType.RolePlayingGames },
                { "releaseDate", DateTime.UtcNow.AddYears(-1) }
            });

            await scope.ServiceProvider.GetRequiredService<MongoDbInitializer>().InitializeAsync();

            var migrated = (await settings.Find(FilterDefinition<BsonDocument>.Empty).FirstAsync())["GameCategories"].AsBsonArray;
            Assert.Equal("action", migrated[(int)GameType.Action]["Tag"].AsString);
            Assert.Equal("rpg", migrated[(int)GameType.RolePlayingGames]["Tag"].AsString);
            Assert.Equal("RPG", migrated[(int)GameType.RolePlayingGames]["Title"].AsString);
            Assert.Equal("massively-multiplayer-online-mmo", migrated[(int)GameType.MassivelyMultiplayerOnline]["Tag"].AsString);

            var game = await games.Find(Builders<BsonDocument>.Filter.Eq("_id", gameId)).SingleAsync();
            Assert.Equal("rpg", game["genre"].AsString);

            // Повторный запуск ничего не трогает.
            await scope.ServiceProvider.GetRequiredService<MongoDbInitializer>().InitializeAsync();
            Assert.Equal("rpg", (await games.Find(Builders<BsonDocument>.Filter.Eq("_id", gameId)).SingleAsync())["genre"].AsString);
        }
        finally
        {
            await games.DeleteOneAsync(Builders<BsonDocument>.Filter.Eq("_id", gameId));
            await settings.UpdateOneAsync(Builders<BsonDocument>.Filter.Eq("_id", stored["_id"]), Builders<BsonDocument>.Update.Set("GameCategories", originalGenres));
            scope.ServiceProvider.GetRequiredService<IGameGenreDirectory>().Invalidate();
            scope.ServiceProvider.GetRequiredService<ICatalogSnapshotService>().Invalidate();
        }
    }
}
