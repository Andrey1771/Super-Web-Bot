using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Согласие покупателя на немедленную выдачу ключей.
///
/// Цифровой товар выдаётся сразу, и подтверждение этого — не текст на странице, а запись:
/// если её нет, доказать согласие нечем. Здесь проверяется, что запись действительно
/// появляется, что она содержит НАШУ формулировку, а не присланную с клиента, и что согласие
/// нельзя привязать к неизвестному платежу.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class DeliveryConsentTests
{
    private readonly TaleShopApiFactory _factory;

    public DeliveryConsentTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task<string> SeedIntentAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var finalization = scope.ServiceProvider.GetRequiredService<IOrderFinalizationService>();
        var intentId = $"pi_probe_{Guid.NewGuid():N}";
        await finalization.RecordIntentCreatedAsync(new IntentCreatedRecord
        {
            PaymentIntentId = intentId,
            UserId = "consent-probe@test.io",
            Currency = "USD",
            Total = 10m
        });
        return intentId;
    }

    private BsonDocument? ReadState(string intentId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        return db.GetCollection<BsonDocument>("PaymentFinalizationStates")
            .Find(Builders<BsonDocument>.Filter.Eq("PaymentIntentId", intentId))
            .FirstOrDefault();
    }

    [Fact]
    public async Task Storefront_is_told_which_wording_to_show()
    {
        var response = await _factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/payments/delivery-consent");

        Assert.False(string.IsNullOrWhiteSpace(response.GetProperty("version").GetString()));
        // Формулировку витрина не сочиняет: показывает ровно эту.
        Assert.Contains("withdraw", response.GetProperty("text").GetString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Consent_is_stored_with_our_own_wording()
    {
        var client = _factory.CreateClient();
        var intentId = await SeedIntentAsync();
        var copy = await client.GetFromJsonAsync<JsonElement>("/api/payments/delivery-consent");
        var version = copy.GetProperty("version").GetString();

        var response = await client.PostAsJsonAsync("/api/payments/delivery-consent", new { paymentIntentId = intentId, version });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var state = ReadState(intentId);
        Assert.NotNull(state);
        Assert.Equal(version, state!["DeliveryConsentVersion"].AsString);
        Assert.Equal(copy.GetProperty("text").GetString(), state["DeliveryConsentText"].AsString);
        Assert.True(state.Contains("DeliveryConsentAt"));
    }

    [Fact]
    public async Task Unknown_version_and_unknown_payment_are_refused()
    {
        var client = _factory.CreateClient();
        var intentId = await SeedIntentAsync();

        // Чужая версия — значит показывали не наш текст; принимать такое согласие нельзя.
        var badVersion = await client.PostAsJsonAsync("/api/payments/delivery-consent",
            new { paymentIntentId = intentId, version = "1999-01-01" });
        Assert.Equal(HttpStatusCode.BadRequest, badVersion.StatusCode);

        var copy = await client.GetFromJsonAsync<JsonElement>("/api/payments/delivery-consent");
        var version = copy.GetProperty("version").GetString();

        // Согласие относится к конкретному платежу: под неизвестный запись не заводится.
        var badIntent = await client.PostAsJsonAsync("/api/payments/delivery-consent",
            new { paymentIntentId = "pi_does_not_exist", version });
        Assert.Equal(HttpStatusCode.NotFound, badIntent.StatusCode);

        var state = ReadState(intentId);
        Assert.NotNull(state);
        Assert.False(state!.Contains("DeliveryConsentAt"));
    }
}
