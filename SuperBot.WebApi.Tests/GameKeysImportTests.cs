using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Импорт ключей из файла: разбор формата и предпросмотр перед записью. Главное свойство —
/// dryRun ничего не пишет и говорит ровно то, что потом сделает реальный импорт.
/// </summary>
public class KeyImportParserTests
{
    [Fact]
    public void One_key_per_line_with_comments_and_blank_lines()
    {
        var result = KeyImportParser.Parse("# batch 1\nAAAA-BBBB-1111\n\nCCCC-DDDD-2222\r\n", "steam");
        Assert.Equal(2, result.Keys.Count);
        Assert.All(result.Keys, k => Assert.Equal("steam", k.KeyType));
        Assert.Empty(result.Invalid);
        Assert.Equal(2, result.TotalLines);
    }

    [Fact]
    public void Csv_with_header_and_type_column()
    {
        var result = KeyImportParser.Parse("key,type\nAAAA-BBBB-1111,steam\n\"CCCC-DDDD-2222\";epic\nEEEE-FFFF-3333\t\n", "CD Key");
        Assert.Equal(3, result.Keys.Count);
        Assert.Equal("steam", result.Keys[0].KeyType);
        Assert.Equal("epic", result.Keys[1].KeyType);
        Assert.Equal("CD Key", result.Keys[2].KeyType); // пустая вторая колонка — тип по умолчанию
        Assert.Equal("CCCC-DDDD-2222", result.Keys[1].Key); // кавычки сняты
    }

    [Fact]
    public void Too_short_or_spaced_values_are_reported_not_imported()
    {
        var result = KeyImportParser.Parse("ABCD\nHAS SPACE INSIDE\nGOOD-KEY-0001\n", "steam");
        Assert.Single(result.Keys);
        Assert.Equal(2, result.Invalid.Count);
        Assert.Equal(3, result.TotalLines);
    }

    [Fact]
    public void Bom_is_ignored()
    {
        var result = KeyImportParser.Parse("﻿AAAA-BBBB-1111\n", "steam");
        Assert.Equal("AAAA-BBBB-1111", Assert.Single(result.Keys).Key);
    }
}

[Collection(IntegrationTestCollection.Name)]
public class GameKeysImportTests
{
    private readonly TaleShopApiFactory _factory;

    public GameKeysImportTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "keeper@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<string> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var id = ObjectId.GenerateNewId().ToString();
        var title = $"Keys Game {Guid.NewGuid():N}"[..22];
        await games.CreateAsync(new Game { Id = id, Name = title, Title = title, Price = 3m, Currency = "USD" });
        return id;
    }

    /// <summary>Название игры по id: обзор запасов ищет по имени, а не отдаёт весь каталог.</summary>
    private async Task<string> TitleOfAsync(string gameId)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var game = await games.GetByIdAsync(gameId);
        return game?.Title ?? game?.Name ?? string.Empty;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    [Fact]
    public async Task Dry_run_reports_without_writing_and_real_import_matches_it()
    {
        var gameId = await SeedGameAsync();
        var admin = Admin();
        var content = "key,type\nIMP-0001-AAAA,steam\nIMP-0002-BBBB,steam\nIMP-0002-BBBB,steam\nbad\n";

        var preview = await Body(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}/import", new { content, dryRun = true }));
        Assert.True(preview.GetProperty("dryRun").GetBoolean());
        Assert.Equal(3, preview.GetProperty("parsed").GetInt32());   // две уникальные + один дубль в файле
        Assert.Equal(1, preview.GetProperty("invalid").GetInt32());
        Assert.Equal(2, preview.GetProperty("wouldAdd").GetInt32());
        Assert.Equal(1, preview.GetProperty("duplicates").GetInt32());
        Assert.Equal(0, preview.GetProperty("added").GetInt32());

        // Ничего не записано.
        var inv = await Body(await admin.GetAsync($"/api/admin/keys/inventory/{gameId}"));
        Assert.Equal(0, inv.GetProperty("available").GetInt32());

        var applied = await Body(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}/import", new { content, dryRun = false }));
        Assert.Equal(2, applied.GetProperty("added").GetInt32());
        Assert.Equal(1, applied.GetProperty("duplicates").GetInt32());

        inv = await Body(await admin.GetAsync($"/api/admin/keys/inventory/{gameId}"));
        Assert.Equal(2, inv.GetProperty("available").GetInt32());

        // Кто залил — в списке.
        var list = await Body(await admin.GetAsync($"/api/admin/keys/inventory/{gameId}/list?status=pool"));
        Assert.All(list.GetProperty("items").EnumerateArray(), i => Assert.Equal("keeper@taleshop.test", i.GetProperty("addedBy").GetString()));

        // Повторный импорт того же файла — всё дубли.
        var again = await Body(await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}/import", new { content, dryRun = true }));
        Assert.Equal(0, again.GetProperty("wouldAdd").GetInt32());
        Assert.Equal(3, again.GetProperty("duplicates").GetInt32());
    }

    [Fact]
    public async Task Overview_pages_and_filters_on_the_server()
    {
        // Экран открывают ради того, что требует внимания, поэтому это и есть ответ по умолчанию,
        // а страница ограничена: на большом каталоге отдавать строку на каждую игру нельзя.
        var gameId = await SeedGameAsync();
        var admin = Admin();
        var title = await TitleOfAsync(gameId);

        // Ключей нет — игра «пустая», то есть требует внимания и находится поиском по названию.
        var attention = await Body(await admin.GetAsync("/api/admin/keys/overview?query=" + Uri.EscapeDataString(title)));
        Assert.Equal("attention", attention.GetProperty("status").GetString());
        Assert.Equal(1, attention.GetProperty("total").GetInt32());
        Assert.Equal(gameId, attention.GetProperty("games").EnumerateArray().Single().GetProperty("gameId").GetString());

        // Итоги считаются по всему каталогу, а не по видимой странице.
        Assert.True(attention.GetProperty("totals").GetProperty("games").GetInt32() > 1);

        // Полностью укомплектованных среди неё нет — фильтр честно отдаёт пусто.
        var stocked = await Body(await admin.GetAsync("/api/admin/keys/overview?status=ok&query=" + Uri.EscapeDataString(title)));
        Assert.Equal(0, stocked.GetProperty("total").GetInt32());
        Assert.Empty(stocked.GetProperty("games").EnumerateArray());

        // Размер страницы ограничивается сервером: запрос тысячи строк не проходит.
        var page = await Body(await admin.GetAsync("/api/admin/keys/overview?status=all&pageSize=1000"));
        Assert.True(page.GetProperty("pageSize").GetInt32() <= 100);
        Assert.True(page.GetProperty("games").GetArrayLength() <= 100);
    }

    [Fact]
    public async Task Per_game_threshold_changes_low_stock_flag()
    {
        var gameId = await SeedGameAsync();
        var admin = Admin();
        await admin.PostAsJsonAsync($"/api/admin/keys/inventory/{gameId}/import", new { content = "THR-0001-AAAA\nTHR-0002-BBBB\nTHR-0003-CCCC\n", dryRun = false });

        // Обзор отдаёт страницу и по умолчанию только требующее внимания — спрашиваем свою игру
        // по названию и без фильтра статуса: после смены порога она перестанет быть «мало».
        var title = await TitleOfAsync(gameId);
        var url = "/api/admin/keys/overview?status=all&pageSize=100&query=" + Uri.EscapeDataString(title);

        // Общий порог 5 → 3 ключа это «мало».
        var overview = await Body(await admin.GetAsync(url));
        var row = overview.GetProperty("games").EnumerateArray().Single(g => g.GetProperty("gameId").GetString() == gameId);
        Assert.True(row.GetProperty("low").GetBoolean());

        // Порог 2 для этой игры → уже не мало.
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/admin/keys/inventory/{gameId}/threshold", new { lowStockThreshold = 2 })).StatusCode);
        overview = await Body(await admin.GetAsync(url));
        row = overview.GetProperty("games").EnumerateArray().Single(g => g.GetProperty("gameId").GetString() == gameId);
        Assert.False(row.GetProperty("low").GetBoolean());
        Assert.Equal(2, row.GetProperty("lowThreshold").GetInt32());
    }
}
