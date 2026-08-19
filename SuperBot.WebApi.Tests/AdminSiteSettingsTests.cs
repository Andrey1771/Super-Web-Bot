using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Настройки сайта из админки. Главное свойство — применяются без рестарта: сохранили часы
/// поддержки — и публичный /api/support/chat/config (его считает синглтон SupportAvailability)
/// уже отвечает по-новому. Иначе это была бы форма, которая пишет в базу и ничего не меняет.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class AdminSiteSettingsTests
{
    private readonly TaleShopApiFactory _factory;

    public AdminSiteSettingsTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage r) => JsonSerializer.Deserialize<JsonElement>(await r.Content.ReadAsStringAsync());

    [Fact]
    public async Task Get_returns_effective_default_and_overridden_flag()
    {
        var settings = await Body(await Admin().GetAsync("/api/admin/site-settings"));
        var wait = settings.GetProperty("support").GetProperty("expectedWaitMinutes");
        Assert.True(wait.TryGetProperty("value", out _));
        Assert.True(wait.TryGetProperty("defaultValue", out _));
        Assert.True(wait.TryGetProperty("overridden", out _));
        Assert.True(settings.GetProperty("rails").GetProperty("card").TryGetProperty("configured", out _));
    }

    [Fact]
    public async Task Saving_support_hours_is_visible_to_the_public_chat_config_without_restart()
    {
        var admin = Admin();
        var anon = _factory.CreateClient();

        // Ставим часы, в которые сейчас закрыто: 0:00–1:00 по UTC не может быть «сейчас» дольше часа —
        // поэтому проверяем не флаг открытости, а сам факт «часы настроены» и ожидание, которое задали.
        var put = await admin.PutAsJsonAsync("/api/admin/site-settings", new
        {
            businessHoursEnabled = true,
            businessHoursTimeZone = "UTC",
            businessHoursStart = 0,
            businessHoursEnd = 1,
            expectedWaitMinutes = 42
        });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var config = await Body(await anon.GetAsync("/api/support/chat/config"));
        Assert.True(config.GetProperty("businessHoursConfigured").GetBoolean());
        Assert.Equal(42, config.GetProperty("expectedWaitMinutes").GetInt32());

        var after = await Body(await admin.GetAsync("/api/admin/site-settings"));
        var wait = after.GetProperty("support").GetProperty("expectedWaitMinutes");
        Assert.Equal(42, wait.GetProperty("value").GetInt32());
        Assert.True(wait.GetProperty("overridden").GetBoolean());
        Assert.Equal("owner@taleshop.test", after.GetProperty("updatedBy").GetString());

        // Сброс: null — «как в конфиге».
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { })).StatusCode);
        var reset = await Body(await admin.GetAsync("/api/admin/site-settings"));
        Assert.False(reset.GetProperty("support").GetProperty("expectedWaitMinutes").GetProperty("overridden").GetBoolean());
        var configReset = await Body(await anon.GetAsync("/api/support/chat/config"));
        Assert.NotEqual(42, configReset.GetProperty("expectedWaitMinutes").GetInt32());
    }

    [Fact]
    public async Task Fx_markup_override_reaches_the_fx_admin_view()
    {
        var admin = Admin();
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { fxMarkupPercent = 7.5m })).StatusCode);
        var fx = await Body(await admin.GetAsync("/api/admin/fx-rates"));
        Assert.Equal(7.5m, fx.GetProperty("markupPercent").GetDecimal());
        await admin.PutAsJsonAsync("/api/admin/site-settings", new { });
    }

    [Fact]
    public async Task Card_rail_can_be_switched_off_for_the_storefront()
    {
        var admin = Admin();
        var anon = _factory.CreateClient();

        var before = await Body(await anon.GetAsync("/api/storefront/payment-methods"));
        var cardBefore = before.GetProperty("methods").EnumerateArray().Any(m => string.Equals(m.GetProperty("method").GetString(), "card", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { cardEnabled = false })).StatusCode);
        var after = await Body(await anon.GetAsync("/api/storefront/payment-methods"));
        Assert.DoesNotContain(after.GetProperty("methods").EnumerateArray(), m => string.Equals(m.GetProperty("method").GetString(), "card", StringComparison.OrdinalIgnoreCase));

        await admin.PutAsJsonAsync("/api/admin/site-settings", new { });
        var restored = await Body(await anon.GetAsync("/api/storefront/payment-methods"));
        var cardAfter = restored.GetProperty("methods").EnumerateArray().Any(m => string.Equals(m.GetProperty("method").GetString(), "card", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(cardBefore, cardAfter);
    }

    [Fact]
    public async Task Validation_rejects_nonsense()
    {
        var admin = Admin();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { businessHoursStart = 20, businessHoursEnd = 9 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { businessHoursTimeZone = "Mars/Olympus" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/site-settings", new { fxMaxChangePercent = 0 })).StatusCode);
    }

    [Fact]
    public async Task Requires_admin()
    {
        var support = _factory.CreateClient();
        support.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        support.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "support");
        Assert.Equal(HttpStatusCode.Forbidden, (await support.GetAsync("/api/admin/site-settings")).StatusCode);
    }
}
