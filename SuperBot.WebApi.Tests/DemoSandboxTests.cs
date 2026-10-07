using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Demo;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Demo;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>То же приложение, но демо-сайтом: песочницы включены.</summary>
public sealed class DemoApiFactory : TaleShopApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Demo:Enabled", "true");
        builder.UseSetting("Demo:MaxSandboxesPerIpPerDay", "1000");
        // Запасные копии тесты собирают сами (RefillSparesAsync), чтобы фон не мешал проверкам.
        builder.UseSetting("Demo:SpareSandboxes", "0");
    }
}

/// <summary>
/// Демо-сайт: у каждого посетителя своя копия базы. Главное, что здесь проверяется, — копии не видят друг друга
/// ни через базу, ни через кэш в памяти, а шаблон без песочницы менять нельзя.
/// </summary>
public class DemoSandboxTests : IClassFixture<DemoApiFactory>
{
    private readonly DemoApiFactory _factory;

    public DemoSandboxTests(DemoApiFactory factory) => _factory = factory;

    private HttpClient Admin(HttpClient? client = null)
    {
        client ??= _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "admin@test.local");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    /// <summary>Посетитель со своей копией: cookie песочницы клиент хранит сам.</summary>
    private async Task<HttpClient> VisitorWithSandboxAsync()
    {
        var client = Admin();
        var created = await client.PostAsync("/api/demo/sandbox", null);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    private async Task<Game> SeedTemplateGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var slug = $"demo-{Guid.NewGuid():N}"[..22];
        var game = new Game
        {
            Id = ObjectId.GenerateNewId().ToString(), Name = slug, Title = slug, Slug = slug, Price = 30m, Currency = "USD",
            ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1), Kind = ProductKind.Game, Genre = "strategy", GameType = GameType.Strategy,
        };
        await scope.ServiceProvider.GetRequiredService<IGameRepository>().CreateAsync(game);
        scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();
        return game;
    }

    private static async Task<decimal?> CatalogPriceAsync(HttpClient client, Game game)
    {
        var page = await Body(await client.GetAsync($"/api/game/catalog?q={game.Title}&pageSize=48"));
        var item = page.GetProperty("items").EnumerateArray().FirstOrDefault(i => i.GetProperty("id").GetString() == game.Id);
        return item.ValueKind == JsonValueKind.Undefined ? null : item.GetProperty("price").GetDecimal();
    }

    [Fact]
    public async Task Without_a_sandbox_the_template_is_read_only()
    {
        var game = await SeedTemplateGameAsync();
        var visitor = Admin();

        var config = await Body(await visitor.GetAsync("/api/demo/config"));
        Assert.True(config.GetProperty("enabled").GetBoolean());
        Assert.Equal(JsonValueKind.Null, config.GetProperty("sandbox").ValueKind);

        Assert.Equal(30m, await CatalogPriceAsync(visitor, game));
        var write = await visitor.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = "Template DLC", price = 5m });
        Assert.Equal(HttpStatusCode.Conflict, write.StatusCode);
        Assert.Equal("demo_sandbox_required", (await Body(write)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Sandboxes_do_not_see_each_others_changes_in_the_database_or_the_cache()
    {
        var game = await SeedTemplateGameAsync();
        var a = await VisitorWithSandboxAsync();
        var b = await VisitorWithSandboxAsync();
        var template = Admin();

        // Кэш каталога прогрет во всех трёх местах до правки.
        Assert.Equal(30m, await CatalogPriceAsync(a, game));
        Assert.Equal(30m, await CatalogPriceAsync(b, game));
        Assert.Equal(30m, await CatalogPriceAsync(template, game));

        // В копии A: новое DLC и новая цена игры.
        Assert.Equal(HttpStatusCode.OK, (await a.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = "Sandbox DLC", price = 5m })).StatusCode);
        var matrix = await Body(await a.GetAsync("/api/admin/prices"));
        var currency = matrix.GetProperty("baseCurrency").GetString()!;
        Assert.Equal(HttpStatusCode.OK, (await a.PutAsJsonAsync($"/api/admin/prices/{game.Id}/{currency}", new { price = 12.5m })).StatusCode);

        Assert.Single((await Body(await a.GetAsync($"/api/admin/games/{game.Id}/dlc"))).GetProperty("items").EnumerateArray());
        Assert.Empty((await Body(await b.GetAsync($"/api/admin/games/{game.Id}/dlc"))).GetProperty("items").EnumerateArray());
        Assert.Empty((await Body(await template.GetAsync($"/api/admin/games/{game.Id}/dlc"))).GetProperty("items").EnumerateArray());

        Assert.Equal(12.5m, await CatalogPriceAsync(a, game));
        Assert.Equal(30m, await CatalogPriceAsync(b, game));
        Assert.Equal(30m, await CatalogPriceAsync(template, game));
    }

    [Fact]
    public async Task Actions_that_change_shared_state_are_read_only_inside_a_sandbox()
    {
        var visitor = await VisitorWithSandboxAsync();

        var settings = await visitor.PutAsJsonAsync("/api/admin/site-settings", new { });
        Assert.Equal(HttpStatusCode.Forbidden, settings.StatusCode);
        Assert.Equal("demo_readonly", (await Body(settings)).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await visitor.PostAsJsonAsync("/api/account/security/password/change", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await visitor.PostAsync("/api/admin/customers/a@b.c/block", null)).StatusCode);
    }

    [Fact]
    public async Task Reset_brings_the_template_back_and_close_removes_the_copy()
    {
        var game = await SeedTemplateGameAsync();
        var visitor = await VisitorWithSandboxAsync();
        await visitor.PostAsJsonAsync($"/api/admin/games/{game.Id}/dlc", new { name = "Gone after reset", price = 5m });
        Assert.Single((await Body(await visitor.GetAsync($"/api/admin/games/{game.Id}/dlc"))).GetProperty("items").EnumerateArray());

        Assert.Equal(HttpStatusCode.OK, (await visitor.PostAsync("/api/demo/sandbox/reset", null)).StatusCode);
        Assert.Empty((await Body(await visitor.GetAsync($"/api/admin/games/{game.Id}/dlc"))).GetProperty("items").EnumerateArray());

        Assert.Equal(HttpStatusCode.NoContent, (await visitor.DeleteAsync("/api/demo/sandbox")).StatusCode);
        var config = await Body(await visitor.GetAsync("/api/demo/config"));
        Assert.Equal(JsonValueKind.Null, config.GetProperty("sandbox").ValueKind);
    }

    [Fact]
    public async Task Mailbox_shows_only_the_letters_of_its_own_copy()
    {
        var a = await VisitorWithSandboxAsync();
        var b = await VisitorWithSandboxAsync();
        var latestId = await SandboxIdOfLatestAsync();

        using (DemoSandbox.Enter(latestId))
        {
            using var scope = _factory.Services.CreateScope();
            await new DemoMailboxSender(scope.ServiceProvider.GetRequiredService<IMongoDatabase>())
                .SendAsync("buyer@example.com", "Your key", "DEMO-1234");
        }

        // Последней открыта копия B: письмо отправлено в B.
        var inB = (await Body(await b.GetAsync("/api/demo/mailbox"))).EnumerateArray().ToList();
        var inA = (await Body(await a.GetAsync("/api/demo/mailbox"))).EnumerateArray().ToList();
        Assert.Equal("Your key", Assert.Single(inB).GetProperty("subject").GetString());
        Assert.Empty(inA);
    }

    [Fact]
    public async Task Upcoming_games_stay_upcoming_in_every_new_copy()
    {
        var game = await SeedTemplateGameAsync();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
                .GetCollection<BsonDocument>(DemoSandboxService.UpcomingCollection)
                .InsertOneAsync(new BsonDocument { { "gameId", game.Id }, { "offsetDays", 40 } });
        }

        await VisitorWithSandboxAsync();
        var id = await SandboxIdOfLatestAsync();
        using (DemoSandbox.Enter(id))
        {
            using var scope = _factory.Services.CreateScope();
            var copy = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(game.Id!);
            Assert.Equal(DateTime.UtcNow.Date.AddDays(40), copy.ReleaseDate.ToUniversalTime().Date);
        }
    }

    [Fact]
    public async Task A_visitor_gets_a_ready_spare_copy_and_it_is_then_rebuilt()
    {
        var game = await SeedTemplateGameAsync();
        var sandboxes = _factory.Services.GetRequiredService<DemoSandboxService>();
        Assert.Equal(1, await sandboxes.RefillSparesAsync(CancellationToken.None, target: 1));

        var visitor = await VisitorWithSandboxAsync();

        // Выдана именно запасная (новых копий не собиралось), и в ней всё как в шаблоне.
        Assert.Equal(0, await sandboxes.RefillSparesAsync(CancellationToken.None, target: 0));
        Assert.Equal(30m, await CatalogPriceAsync(visitor, game));
        Assert.Equal(1, await sandboxes.RefillSparesAsync(CancellationToken.None, target: 1));
    }

    [Fact]
    public async Task Search_engines_are_told_to_stay_away_from_the_demo()
    {
        var robots = await _factory.CreateClient().GetStringAsync("/robots.txt");
        Assert.Equal("User-agent: *\nDisallow: /\n", robots);
    }

    [Fact]
    public async Task Background_tracking_without_a_copy_is_accepted_and_dropped()
    {
        var visitor = _factory.CreateClient();
        var response = await visitor.PostAsJsonAsync("/api/tracking/game-view", new { gameId = "x" });

        // Не 409: иначе витрина открывала бы приглашение на каждой странице.
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Stripe_webhook_for_a_payment_outside_live_copies_is_acknowledged_and_ignored()
    {
        var body = new StringContent(
            "{\"type\":\"charge.refunded\",\"data\":{\"object\":{\"object\":\"charge\",\"id\":\"ch_1\",\"payment_intent\":\"pi_unknown\"}}}",
            System.Text.Encoding.UTF8, "application/json");
        var response = await _factory.CreateClient().PostAsync("/api/payments/webhook", body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("ignored", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Charge_webhooks_find_their_copy_by_the_payment_id()
    {
        await VisitorWithSandboxAsync();
        var id = await SandboxIdOfLatestAsync();
        var sandboxes = _factory.Services.GetRequiredService<DemoSandboxService>();
        await sandboxes.RememberPaymentAsync("pi_demo_1", id, CancellationToken.None);

        Assert.Equal(id, await sandboxes.FindPaymentSandboxAsync("pi_demo_1", CancellationToken.None));
        Assert.Null(await sandboxes.FindPaymentSandboxAsync("pi_other", CancellationToken.None));
    }

    [Fact]
    public async Task Template_upcoming_games_stay_upcoming_for_visitors_without_a_copy()
    {
        var game = await SeedTemplateGameAsync();
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
                .GetCollection<BsonDocument>(DemoSandboxService.UpcomingCollection)
                .InsertOneAsync(new BsonDocument { { "gameId", game.Id }, { "offsetDays", 35 } });
        }

        await _factory.Services.GetRequiredService<DemoSandboxService>().ShiftTemplateUpcomingAsync(CancellationToken.None);

        using var check = _factory.Services.CreateScope();
        var template = await check.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(game.Id!);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(35), template.ReleaseDate.ToUniversalTime().Date);
    }

    [Fact]
    public async Task Scopes_created_by_long_lived_services_inside_a_copy_request_use_the_site_database()
    {
        await VisitorWithSandboxAsync();
        var id = await SandboxIdOfLatestAsync();
        var accessor = _factory.Services.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>();
        using var request = _factory.Services.CreateScope();
        var previous = accessor.HttpContext;
        accessor.HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext { RequestServices = request.ServiceProvider };
        try
        {
            using (DemoSandbox.Enter(id))
            {
                var templateName = _factory.Services.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()["ConnectionStrings:Name"];
                // Область самого запроса — копия посетителя.
                Assert.Equal("tsdemo_" + id, request.ServiceProvider.GetRequiredService<IMongoDatabase>().DatabaseNamespace.DatabaseName);
                // Своя область долгоживущего сервиса (настройки сайта, курсы) — база сайта.
                using var own = _factory.Services.CreateScope();
                Assert.Equal(templateName, own.ServiceProvider.GetRequiredService<IMongoDatabase>().DatabaseNamespace.DatabaseName);
            }
        }
        finally
        {
            accessor.HttpContext = previous;
        }
    }

    /// <summary>Id песочницы из журнала: cookie у клиента HttpOnly, а тесту нужен сам id.</summary>
    private async Task<string> SandboxIdOfLatestAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var registry = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<BsonDocument>(DemoSandboxService.RegistryCollection);
        var latest = await registry.Find(Builders<BsonDocument>.Filter.Ne("status", "spare")).SortByDescending(d => d["claimedAt"]).FirstAsync();
        return latest["_id"].AsString;
    }
}
