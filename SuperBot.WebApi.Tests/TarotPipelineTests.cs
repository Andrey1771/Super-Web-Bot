using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// «Карта удачи» (сказочное таро на главной): механика раздаёт НАСТОЯЩИЕ промокоды,
/// поэтому проверяем не разметку, а деньги — что код работает на чекауте, что его
/// нельзя получить дважды и что параллельные запросы не выдают лишних скидок.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class TarotPipelineTests
{
    // Личность определяется по email (CurrentUserExtensions.GetUserKey), поэтому у каждого
    // теста свой пользователь: кулдаун хранится по нему, и общий email ломал бы соседний тест.
    private readonly TaleShopApiFactory _factory;

    public TarotPipelineTests(TaleShopApiFactory factory) => _factory = factory;

    // ---------- helpers ----------

    private HttpClient CreateClient(string? email = null, bool admin = false)
    {
        var client = _factory.CreateClient();
        if (email != null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
            client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, $"sub-{email}");
        }
        if (admin)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        }
        return client;
    }

    private static string NewUserEmail() => $"tarot-{Guid.NewGuid():N}@taleshop.test";

    /// <summary>
    /// Настройки механики пишем напрямую — админский эндпоинт проверяется отдельно.
    /// По умолчанию требование покупки выключено: большинство тестов проверяет сам розыгрыш,
    /// а правило «только покупателям» вынесено в отдельные тесты.
    /// </summary>
    private async Task ConfigureAsync(
        bool enabled = true,
        int cooldownHours = 24,
        bool requirePurchase = false,
        params (decimal Percent, int Weight)[] tiers)
    {
        using var scope = _factory.Services.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ITarotSettingsRepository>();
        await settings.UpsertAsync(new TarotSettings
        {
            Enabled = enabled,
            RequirePurchase = requirePurchase,
            CooldownHours = cooldownHours,
            CodeTtlHours = 24,
            Tiers = tiers.Length > 0
                ? tiers.Select(tier => new TarotLuckyTier { Percent = tier.Percent, Weight = tier.Weight }).ToList()
                : TarotSettings.DefaultTiers()
        });
    }

    /// <summary>Оплаченный заказ пользователя — то, что открывает ему колоду.</summary>
    private async Task SeedPaidOrderAsync(string userKey)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();

        var id = Guid.NewGuid();
        await orders.CreateOrderAsync(new Order
        {
            Id = id,
            OrderGuid = id,
            UserId = userKey,
            UserName = userKey,
            GameName = "Tarot buyer order",
            IsPaid = true,
            PaidAt = DateTime.UtcNow.AddDays(-1),
            OrderDate = DateTime.UtcNow.AddDays(-1),
            PaymentStatus = "PAID"
        });
    }

    private async Task<PromoCode?> GetPromoAsync(string code)
    {
        using var scope = _factory.Services.CreateScope();
        var promos = scope.ServiceProvider.GetRequiredService<IPromoCodeRepository>();
        return await promos.GetByCodeAsync(code);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    // ---------- tests ----------

    [Fact]
    public async Task Draw_gives_a_working_single_use_promo_code()
    {
        await ConfigureAsync(tiers: (10m, 1));
        var user = CreateClient(NewUserEmail());

        var response = await user.PostAsync("/api/tarot/draw", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        var code = payload.GetProperty("code").GetString()!;
        Assert.StartsWith("TARO-", code);
        Assert.Equal(10m, payload.GetProperty("percent").GetDecimal());

        // Главное: карта выдаёт не украшение, а реальный промокод в общей системе скидок.
        var promo = await GetPromoAsync(code);
        Assert.NotNull(promo);
        Assert.Equal(PromoCodeType.Percentage, promo!.Type);
        Assert.Equal(10m, promo.Value);
        Assert.Equal(1, promo.UsageLimit);
        Assert.True(promo.IsActiveAt(DateTime.UtcNow), "Свежий код должен быть активен сразу.");
    }

    [Fact]
    public async Task Second_draw_within_cooldown_is_rejected()
    {
        await ConfigureAsync(cooldownHours: 24, tiers: (5m, 1));
        var user = CreateClient(NewUserEmail());

        var first = await user.PostAsync("/api/tarot/draw", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await user.PostAsync("/api/tarot/draw", null);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Parallel_draws_produce_exactly_one_code()
    {
        // Тот самый дефект: проверка кулдауна и запись — разные операции, и между ними
        // проходил второй запрос. Теперь право на розыгрыш занимается атомарно.
        await ConfigureAsync(cooldownHours: 24, tiers: (5m, 1));
        var email = NewUserEmail();

        var attempts = await Task.WhenAll(Enumerable.Range(0, 5).Select(async _ =>
        {
            var client = CreateClient(email);
            return await client.PostAsync("/api/tarot/draw", null);
        }));

        var succeeded = attempts.Count(response => response.StatusCode == HttpStatusCode.OK);
        Assert.Equal(1, succeeded);
    }

    [Fact]
    public async Task Draw_percent_always_comes_from_configured_tiers()
    {
        // Один тир с весом — значит выпасть может только он: проверяем, что розыгрыш
        // не изобретает проценты сам и не берёт их из запроса.
        await ConfigureAsync(cooldownHours: 24, tiers: (7m, 1));

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var user = CreateClient(NewUserEmail());
            var payload = await ReadJsonAsync(await user.PostAsync("/api/tarot/draw", null));
            Assert.Equal(7m, payload.GetProperty("percent").GetDecimal());
        }
    }

    [Fact]
    public async Task Disabled_mechanic_gives_nothing()
    {
        await ConfigureAsync(enabled: false);
        var user = CreateClient(NewUserEmail());

        var response = await user.PostAsync("/api/tarot/draw", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        await ConfigureAsync(); // возвращаем механику соседним тестам
    }

    [Fact]
    public async Task Anonymous_cannot_draw()
    {
        await ConfigureAsync();
        var guest = CreateClient(email: null);

        var response = await guest.PostAsync("/api/tarot/draw", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task State_shows_drawn_code_and_blocks_next_draw()
    {
        await ConfigureAsync(cooldownHours: 24, tiers: (15m, 1));
        var user = CreateClient(NewUserEmail());

        var drawn = await ReadJsonAsync(await user.PostAsync("/api/tarot/draw", null));
        var code = drawn.GetProperty("code").GetString();

        var state = await user.GetFromJsonAsync<JsonElement>("/api/tarot/state");
        Assert.False(state.GetProperty("canDraw").GetBoolean());
        Assert.Equal(code, state.GetProperty("current").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Admin_can_reconfigure_tiers_and_non_admin_cannot()
    {
        var admin = CreateClient(NewUserEmail(), admin: true);
        var response = await admin.PutAsJsonAsync("/api/admin/tarot", new
        {
            enabled = true,
            cooldownHours = 12,
            codeTtlHours = 6,
            tiers = new[] { new { percent = 20m, weight = 3 } }
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var saved = await ReadJsonAsync(response);
        Assert.Equal(12, saved.GetProperty("settings").GetProperty("cooldownHours").GetInt32());

        // Обычный пользователь настройки не трогает.
        var user = CreateClient(NewUserEmail());
        var forbidden = await user.PutAsJsonAsync("/api/admin/tarot", new { enabled = false });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        await ConfigureAsync(); // возвращаем дефолт соседним тестам
    }

    [Fact]
    public async Task Buyers_only_mode_blocks_users_without_purchases()
    {
        // Барьер против мультиаккаунтов: новый аккаунт бесплатен, покупка — нет.
        await ConfigureAsync(requirePurchase: true, tiers: (5m, 1));
        var freshUser = CreateClient(NewUserEmail());

        var response = await freshUser.PostAsync("/api/tarot/draw", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.True(payload.GetProperty("purchaseRequired").GetBoolean());

        await ConfigureAsync(); // возвращаем механику соседним тестам
    }

    [Fact]
    public async Task Buyers_only_mode_lets_a_customer_draw()
    {
        await ConfigureAsync(requirePurchase: true, tiers: (5m, 1));
        var email = NewUserEmail();
        await SeedPaidOrderAsync(email);

        var buyer = CreateClient(email);
        var response = await buyer.PostAsync("/api/tarot/draw", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await ConfigureAsync();
    }

    [Fact]
    public async Task State_explains_why_the_card_is_sealed()
    {
        await ConfigureAsync(requirePurchase: true, tiers: (5m, 1));
        var freshUser = CreateClient(NewUserEmail());

        var state = await freshUser.GetFromJsonAsync<JsonElement>("/api/tarot/state");

        // Витрина по этим флагам показывает «карта откроется после первой покупки».
        Assert.True(state.GetProperty("purchaseRequired").GetBoolean());
        Assert.False(state.GetProperty("canDraw").GetBoolean());

        await ConfigureAsync();
    }

    [Fact]
    public async Task Tier_with_invalid_percent_is_rejected()
    {
        var admin = CreateClient(NewUserEmail(), admin: true);

        var response = await admin.PutAsJsonAsync("/api/admin/tarot", new
        {
            enabled = true,
            tiers = new[] { new { percent = 150m, weight = 1 } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
