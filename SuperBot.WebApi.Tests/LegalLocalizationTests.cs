using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Services.SiteSettings;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Реквизиты продавца на языке покупателя: переводы лежат в конфиге секцией Legal:I18n:&lt;язык&gt;:&lt;Поле&gt;,
/// английское — основное, поле без перевода отдаётся по-английски.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class LegalLocalizationTests
{
    private readonly TaleShopApiFactory _factory;

    public LegalLocalizationTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public void Text_picks_the_translation_case_insensitively_and_falls_back_to_english()
    {
        var legal = new LegalOptions
        {
            DisputeForum = "Harju County Court",
            I18n = new() { ["RU"] = new() { ["disputeforum"] = "  Харьюский суд ", ["LiabilityLimits"] = "   " } },
        };

        Assert.Equal("Харьюский суд", legal.Text("DisputeForum", legal.DisputeForum, "ru-RU,ru;q=0.9"));
        Assert.Equal("Harju County Court", legal.Text("DisputeForum", legal.DisputeForum, "uk"));
        Assert.Equal("Harju County Court", legal.Text("DisputeForum", legal.DisputeForum, null));
        Assert.Equal("Harju County Court", legal.Text("DisputeForum", legal.DisputeForum, "de"));
        // Пустой перевод — как отсутствующий.
        Assert.Equal("limits", legal.Text("LiabilityLimits", "limits", "ru"));
    }

    [Fact]
    public async Task Storefront_legal_follows_the_buyer_language_and_varies_the_cache_by_it()
    {
        using var scope = _factory.Services.CreateScope();
        var configured = scope.ServiceProvider.GetRequiredService<IOptionsSnapshot<LegalOptions>>().Value;
        Assert.True(configured.I18n.ContainsKey("ru"), "в appsettings.json должна быть секция Legal:I18n:ru");

        var plain = _factory.CreateClient();
        var english = await (await plain.GetAsync("/api/storefront/legal")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(configured.GoverningLawCountry, english.GetProperty("governingLawCountry").GetString());

        var russianClient = _factory.CreateClient();
        russianClient.DefaultRequestHeaders.Add("Accept-Language", "ru");
        var response = await russianClient.GetAsync("/api/storefront/legal");
        var russian = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(configured.I18n["ru"]["GoverningLawCountry"], russian.GetProperty("governingLawCountry").GetString());
        Assert.Equal(configured.I18n["ru"]["EffectiveDate"], russian.GetProperty("effectiveDate").GetString());
        // Реквизиты, которые не переводятся, одинаковы на любом языке.
        Assert.Equal(configured.Entity, russian.GetProperty("entity").GetString());
        Assert.Equal(configured.Address, russian.GetProperty("address").GetString());
        Assert.Contains("Accept-Language", response.Headers.Vary);
    }
}
