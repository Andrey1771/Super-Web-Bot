using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SuperBot.WebApi.Services.SiteSettings;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>Ссылки на соцсети в подвале: только настоящие профили на доменах своей сети, по одной на сеть.</summary>
public class SocialLinksTests
{
    [Fact]
    public void Normalize_keeps_one_https_profile_per_known_network_in_a_fixed_order()
    {
        var links = SocialLinks.Normalize(new[]
        {
            new SocialLink { Network = "x", Url = " https://twitter.com/taleshop_real " },
            new SocialLink { Network = "telegram", Url = "https://www.t.me/taleshop_real" },
            new SocialLink { Network = "telegram", Url = "https://t.me/second" },
            new SocialLink { Network = "discord", Url = "" },
            new SocialLink { Network = "myspace", Url = "https://myspace.com/x" },
        });

        Assert.Equal(new[] { "telegram", "x" }, links.Select(l => l.Network));
        Assert.Equal("https://www.t.me/taleshop_real", links[0].Url);
        Assert.Equal("https://twitter.com/taleshop_real", links[1].Url);
    }

    [Theory]
    [InlineData("telegram", "http://t.me/channel")]          // не https
    [InlineData("telegram", "https://evil.example/t.me/x")]  // чужой домен
    [InlineData("telegram", "https://t.me.evil.example/x")]  // похожий домен
    [InlineData("discord", "https://discord.gg/")]           // домен без профиля
    [InlineData("x", "javascript:alert(1)")]
    [InlineData("myspace", "https://myspace.com/x")]         // сети нет в подвале
    public void Validate_rejects_links_that_must_not_reach_the_footer(string network, string url)
    {
        Assert.NotNull(SocialLinks.Validate(new[] { new SocialLink { Network = network, Url = url } }));
        Assert.Empty(SocialLinks.Normalize(new[] { new SocialLink { Network = network, Url = url } }));
    }

    [Fact]
    public void Empty_urls_mean_no_link_and_broken_json_means_no_block()
    {
        Assert.Null(SocialLinks.Validate(new[] { new SocialLink { Network = "telegram", Url = "  " } }));
        Assert.Empty(SocialLinks.Parse("{ not json"));
        Assert.Empty(SocialLinks.Parse(null));
    }
}

/// <summary>Админ сохраняет ссылки в настройках сайта — подвал получает их с публичного маршрута.</summary>
[Collection(IntegrationTestCollection.Name)]
public class SocialLinksApiTests
{
    private readonly TaleShopApiFactory _factory;

    public SocialLinksApiTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    [Fact]
    public async Task Links_saved_by_the_admin_reach_the_footer_and_bad_ones_are_refused()
    {
        var admin = Admin();
        var guest = _factory.CreateClient();
        try
        {
            // До настройки блока нет — никаких выдуманных профилей.
            Assert.Empty(await guest.GetFromJsonAsync<JsonElement[]>("/api/about/social") ?? Array.Empty<JsonElement>());

            var bad = await admin.PutAsJsonAsync("/api/admin/site-settings", new { social = new[] { new { network = "telegram", url = "https://evil.example/channel" } } });
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
            Assert.Contains("t.me", (await bad.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString());

            var saved = await admin.PutAsJsonAsync("/api/admin/site-settings", new
            {
                social = new[]
                {
                    new { network = "x", url = "https://x.com/taleshop_real" },
                    new { network = "telegram", url = "https://t.me/taleshop_real" },
                    new { network = "discord", url = "" },
                }
            });
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

            var footer = await guest.GetFromJsonAsync<JsonElement>("/api/about/social");
            Assert.Equal(new[] { "telegram", "x" }, footer.EnumerateArray().Select(l => l.GetProperty("network").GetString()));

            var settings = await admin.GetFromJsonAsync<JsonElement>("/api/admin/site-settings");
            Assert.Equal(2, settings.GetProperty("social").GetProperty("value").GetArrayLength());
            Assert.Equal(3, settings.GetProperty("social").GetProperty("networks").GetArrayLength());
        }
        finally
        {
            await admin.PutAsJsonAsync("/api/admin/site-settings", new { });
        }
    }
}
