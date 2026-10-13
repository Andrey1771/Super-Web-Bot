using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Demo;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>То же приложение, но демо-сайтом: общий демо-админ demo-admin.</summary>
public sealed class DemoApiFactory : TaleShopApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Demo:Enabled", "true");
        builder.UseSetting("Demo:Accounts:0:Role", "admin");
        builder.UseSetting("Demo:Accounts:0:Username", "demo-admin");
        builder.UseSetting("Demo:Accounts:0:Password", "demo-pass");
    }
}

/// <summary>
/// Демо-сайт — обычный магазин: посетители регистрируются, покупают и пишут в поддержку. Особый только общий
/// демо-админ: видит всю админку, но ничего не меняет, а почты посетителей видит замаскированными.
/// </summary>
public class DemoModeTests : IClassFixture<DemoApiFactory>
{
    private readonly DemoApiFactory _factory;

    public DemoModeTests(DemoApiFactory factory) => _factory = factory;

    private HttpClient DemoAdmin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "demo-admin@taleshop-demo.invalid");
        client.DefaultRequestHeaders.Add(TestAuthHandler.UsernameHeader, "demo-admin");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private HttpClient RealAdmin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.UsernameHeader, "owner");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private async Task<Game> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var slug = $"demo-{Guid.NewGuid():N}"[..22];
        var game = new Game
        {
            Id = ObjectId.GenerateNewId().ToString(), Name = slug, Title = slug, Slug = slug, Price = 30m, Currency = "USD",
            ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1), Kind = ProductKind.Game, Genre = "strategy", GameType = GameType.Strategy,
        };
        await scope.ServiceProvider.GetRequiredService<IGameRepository>().CreateAsync(game);
        return game;
    }

    [Fact]
    public async Task Config_offers_the_demo_admin_account()
    {
        var config = await _factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/demo/config");

        Assert.True(config.GetProperty("enabled").GetBoolean());
        var account = Assert.Single(config.GetProperty("accounts").EnumerateArray());
        Assert.Equal("admin", account.GetProperty("role").GetString());
        Assert.Equal("demo-admin", account.GetProperty("username").GetString());
        Assert.False(config.TryGetProperty("sandbox", out _));
    }

    [Fact]
    public async Task Demo_admin_sees_the_admin_panel_but_cannot_change_anything()
    {
        var game = await SeedGameAsync();
        var admin = DemoAdmin();

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/admin/games/{game.Id}/details")).StatusCode);

        var delete = await admin.DeleteAsync($"/api/game/{game.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
        Assert.Equal("demo_readonly", (await delete.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        // Общий аккаунт: свой профиль и безопасность тоже не трогает — иначе сломал бы вход всем следующим.
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PatchAsJsonAsync("/api/account/profile", new { displayName = "x" })).StatusCode);

        using var scope = _factory.Services.CreateScope();
        Assert.NotNull(await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(game.Id!));
    }

    [Fact]
    public async Task Demo_admin_still_may_chat_with_support_and_send_tracking()
    {
        var admin = DemoAdmin();

        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/support/chat/sessions", new { locale = "en" })).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/blog/events", new { })).StatusCode);
    }

    [Fact]
    public async Task Demo_admin_may_buy_but_not_save_cards_or_mail_keys_again()
    {
        var admin = DemoAdmin();
        var orderId = Guid.NewGuid();

        // Покупка целиком: корзина, регион, промокод, оплата, свои ключи — клиент проходит весь путь под одной учёткой.
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/cart/demo-admin@taleshop-demo.invalid", new { userId = "demo-admin@taleshop-demo.invalid", cartGames = Array.Empty<object>() })).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/storefront/region/check", new { gameIds = Array.Empty<string>() })).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/promo/validate", new { code = "NOPE" })).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/payments/create-payment-intent", new { })).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync($"/api/account/orders/{orderId}/keys/reveal", new { password = "x" })).StatusCode);

        // Карты общей учётки он не меняет, а письмо с ключами на адрес .invalid вернулось бы отказом.
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync("/api/billing/payment-methods/setup-intent", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync($"/api/account/orders/{orderId}/resend-keys", null)).StatusCode);
        Assert.False(DemoGuard.ViewerMaySend("POST", $"/api/account/orders/{orderId}/keys/reveal/extra"));
    }

    [Fact]
    public async Task Regular_visitors_and_real_admins_are_not_restricted()
    {
        // Чат поддержки без всяких копий: раньше без своей копии магазина любой посетитель получал 409.
        var visitor = await _factory.CreateClient().PostAsJsonAsync("/api/support/chat/sessions", new { locale = "en" });
        Assert.Equal(HttpStatusCode.OK, visitor.StatusCode);

        var game = await SeedGameAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await RealAdmin().DeleteAsync($"/api/game/{game.Id}")).StatusCode);
    }

    [Fact]
    public void Visitor_emails_are_masked_but_demo_addresses_are_kept()
    {
        var masked = DemoGuard.MaskEmails("""{"email":"john.smith@gmail.com","owner":"demo-admin@taleshop-demo.invalid","x":"a@example.com"}""");

        Assert.Contains("\"j***@gmail.com\"", masked);
        Assert.DoesNotContain("john.smith", masked);
        Assert.Contains("demo-admin@taleshop-demo.invalid", masked);
        Assert.Contains("a@example.com", masked);
    }

    [Fact]
    public void The_shops_own_addresses_are_not_masked()
    {
        var masked = DemoGuard.MaskEmails(
            """{"supportEmail":"help@taleshop.dev","from":"no-reply@mail.tale-shop.com","visitor":"john@tale-shop.community"}""",
            ["tale-shop.com", "taleshop.dev"]);

        Assert.Contains("help@taleshop.dev", masked);
        Assert.Contains("no-reply@mail.tale-shop.com", masked);
        // Похожий, но чужой домен — маскируется.
        Assert.Contains("j***@tale-shop.community", masked);
    }

    [Fact]
    public void Client_ips_and_devices_are_hidden_but_times_and_lookalikes_stay()
    {
        const string json = """
            {"sessions":[{"id":"s1","ipAddress":"203.0.113.7","start":"2026-10-11T22:50:54Z","lastAccess":"2026-10-11T22:51:00.123Z","device":"Safari on iOS"}],
             "requestIp":"2001:db8::1","requestUserAgent":"Mozilla/5.0 (iPhone)","auditLog":[{"details":"created from 198.51.100.23"}],
             "loginEvents":[{"ipAddress":"fe80::1ff:fe23:4567:890a","clientId":"tale-shop-app"}],
             "licenseDevices":3,"platforms":["windows"],"os":"Windows 10","version":"1.0.2"}
            """;

        var masked = DemoGuard.MaskClientInfo(json);

        foreach (var secret in new[] { "203.0.113.7", "2001:db8::1", "Mozilla", "198.51.100.23", "fe80::1ff", "Safari on iOS" })
        {
            Assert.DoesNotContain(secret, masked);
        }
        Assert.Contains($"\"device\":\"{DemoGuard.HiddenInDemo}\"", masked);
        Assert.Contains("created from •.•.•.•", masked);
        // Время, похожие поля игр и версия не тронуты.
        Assert.Contains("2026-10-11T22:50:54Z", masked);
        Assert.Contains("22:51:00.123Z", masked);
        Assert.Contains("\"clientId\":\"tale-shop-app\"", masked);
        Assert.Contains("\"licenseDevices\":3", masked);
        Assert.Contains("\"os\":\"Windows 10\"", masked);
        Assert.Contains("\"version\":\"1.0.2\"", masked);
    }

    [Fact]
    public void Client_info_is_masked_only_on_routes_that_carry_it()
    {
        Assert.True(DemoGuard.CarriesClientInfo("/api/account/security/status"));
        Assert.True(DemoGuard.CarriesClientInfo("/api/Admin/data"));
        Assert.True(DemoGuard.CarriesClientInfo("/api/account-recovery/admin/requests/1"));
        Assert.False(DemoGuard.CarriesClientInfo("/api/games/subnautica"));
    }

    [Fact]
    public async Task Demo_admin_gets_visitor_emails_masked_in_admin_responses()
    {
        // Посетитель пишет в поддержку со своей почтой — демо-админ видит её только замаскированной.
        var email = $"visitor{Guid.NewGuid():N}"[..20] + "@gmail.com";
        var created = await _factory.CreateClient().PostAsJsonAsync("/api/support/chat/sessions", new { locale = "en", email });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var asDemo = await DemoAdmin().GetStringAsync("/api/support/admin/chat/sessions?pageSize=100");
        var asOwner = await RealAdmin().GetStringAsync("/api/support/admin/chat/sessions?pageSize=100");

        Assert.Contains(email, asOwner);
        Assert.DoesNotContain(email, asDemo);
        Assert.Contains($"{email[0]}***@gmail.com", asDemo);
    }
}
