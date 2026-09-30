using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Публичная проверка для внешнего пингера.
///
/// Единственный ответ, которого нельзя получить изнутри: страница здоровья в админке молчит
/// вместе с сайтом, если сайт лёг. Требования к адресу простые и жёсткие: доступен без входа,
/// не рассказывает лишнего и не кэшируется по дороге — закэшированное «ok» пережило бы аварию,
/// и монитор её не заметил бы.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class PublicHealthTests
{
    private readonly TaleShopApiFactory _factory;

    public PublicHealthTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_isReachableWithoutSigningIn()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
        Assert.Equal("ok", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Health_forbidsCachingTheVerdict()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.Contains("no-store", response.Headers.CacheControl?.ToString() ?? string.Empty);
    }

    [Fact]
    public async Task Health_tellsAnonymousNothingBeyondTheVerdict()
    {
        // Адрес публичный: рассказывать первому встречному, что именно у нас сломано, незачем.
        // Подробности живут в /admin/health, за правами.
        var body = await (await _factory.CreateClient().GetAsync("/api/health")).Content.ReadAsStringAsync();
        var document = JsonSerializer.Deserialize<JsonElement>(body);

        Assert.Single(document.EnumerateObject());
        foreach (var forbidden in new[] { "mongo", "stripe", "keycloak", "smtp", "exception", "stack" })
        {
            Assert.DoesNotContain(forbidden, body, System.StringComparison.OrdinalIgnoreCase);
        }
    }
}
