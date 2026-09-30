using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// ПО в общем каталоге: вид товара, категория, активация и лицензии в изданиях сохраняются и доходят до API, строка
/// заказа получает свой тип, а налог — свой код Stripe Tax. Игры при этом ведут себя как раньше.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class SoftwareProductTests
{
    private readonly TaleShopApiFactory _factory;

    public SoftwareProductTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "owner@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    /// <summary>
    /// Антивирус с двумя лицензиями: «1 year · 1 device» (по умолчанию) и «1 year · 3 devices» с ключом на складе.
    /// Неполный — без категории, активации и без срока и устройств у второй лицензии.
    /// </summary>
    private async Task<(string GameId, string Slug)> SeedSoftwareAsync(bool complete = true)
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var name = $"Nova Security {Guid.NewGuid():N}";
        await games.CreateAsync(new Game
        {
            Name = name,
            Title = name,
            Slug = name.ToLowerInvariant().Replace(' ', '-'),
            Price = 20m,
            ReleaseDate = DateTime.UtcNow.AddDays(-1),
            ImagePath = "cover.png",
            Kind = ProductKind.Software,
            SoftwareCategory = complete ? "security" : null
        });
        var game = (await games.GetAllAsync()).First(item => item.Name == name);

        await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().UpsertAsync(new GameDetails
        {
            GameId = game.Id,
            Slug = game.Slug,
            Title = name,
            DescriptionMarkdown = "All-in-one protection.",
            Platforms = new GamePlatforms { Windows = true, Android = true, Ios = true, PlayStation = true },
            Activation = complete ? new SoftwareActivation { Target = SoftwareActivationTarget.VendorWebsite, Url = "https://nova.example/licenses", Label = "Nova account" } : null,
            Editions = new List<GameEdition>
            {
                new() { Code = "1y-1", Title = "1 year · 1 device", Price = 20m, IsDefault = true, LicenseTermMonths = 12, LicenseDevices = 1 },
                new() { Code = "1y-3", Title = "1 year · 3 devices", Price = 30m, LicenseTermMonths = complete ? 12 : null, LicenseDevices = complete ? 3 : null }
            }
        });
        await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>()
            .AddPoolKeysAsync(game.Id!, "Nova", new[] { $"NOVA-{Guid.NewGuid():N}"[..20] }, editionCode: "1y-3");
        scope.ServiceProvider.GetRequiredService<SuperBot.WebApi.Services.ICatalogSnapshotService>().Invalidate();
        return (game.Id!, game.Slug);
    }

    [Fact]
    public async Task Software_kind_activation_platforms_and_licenses_survive_saving_and_reach_the_api()
    {
        var (gameId, slug) = await SeedSoftwareAsync();

        using (var scope = _factory.Services.CreateScope())
        {
            var game = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(gameId);
            Assert.Equal(ProductKind.Software, game!.Kind);
            Assert.Equal("security", game.SoftwareCategory);

            var details = await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().GetByGameIdAsync(gameId);
            Assert.Equal(SoftwareActivationTarget.VendorWebsite, details.Activation!.Target);
            Assert.Equal("Nova account", details.Activation.Label);
            // Мобильные ОС — новые; PlayStation раньше терялся при сохранении вовсе.
            Assert.True(details.Platforms.Android && details.Platforms.Ios && details.Platforms.PlayStation);
            var license = details.Editions.Single(edition => edition.Code == "1y-3");
            Assert.Equal("1 year · 3 devices", SoftwareCatalog.LicenseLabel(license));
        }

        var client = _factory.CreateClient();
        var page = await (await client.GetAsync($"/api/games/{slug}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Software", page.GetProperty("kind").GetString());
        Assert.Equal("security", page.GetProperty("softwareCategory").GetString());
        // Плашек над заголовком (heroBadges) в ответе нет: место активации ключа ПО показывает карточка покупки.
        Assert.False(page.TryGetProperty("heroBadges", out _));

        var card = await (await client.GetAsync($"/api/game/{gameId}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Software", card.GetProperty("kind").GetString());
    }

    [Fact]
    public async Task Checkout_marks_the_line_as_software_and_taxes_it_with_the_software_code()
    {
        var (gameId, _) = await SeedSoftwareAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, $"sw-{Guid.NewGuid():N}@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, $"u-{Guid.NewGuid():N}");
        client.DefaultRequestHeaders.Add("X-Buyer-Country", "DE");

        var response = await client.PostAsJsonAsync("/api/payments/create-payment-intent", new
        {
            items = new[] { new { gameId, quantity = 1, editionCode = "1y-3" } }
        });
        response.EnsureSuccessStatusCode();

        // Расчёт на кассе ушёл в Stripe Tax с кодом ПО, а не игр.
        var draft = _factory.StripeTax.Calculations.Last(item => item.Lines.Any(line => line.Reference.Contains(gameId)));
        Assert.Equal("txcd_10202000", Assert.Single(draft.Lines).TaxCode);
        Assert.Equal(3000, draft.Lines[0].AmountMinor);

        // Окончательный расчёт после оплаты берёт тип строки из заказа — раньше он терялся, и ПО облагалось как игра.
        using var scope = _factory.Services.CreateScope();
        var order = new Order
        {
            Id = Guid.NewGuid(),
            PaymentProvider = "stripe",
            PaymentIntentId = $"pi_sw_{Guid.NewGuid():N}",
            UserId = "sw@taleshop.test",
            Currency = "USD",
            IsPaid = true,
            TotalAmount = 30m,
            Totals = new MoneyTotals { Total = 30m },
            BuyerCountry = "DE",
            Items = new List<OrderItemSnapshot>
            {
                new() { GameId = gameId, EditionCode = "1y-3", Quantity = 1, LineTotal = 30m, ProductType = ProductTypes.Software }
            }
        };
        await scope.ServiceProvider.GetRequiredService<IOrderRepository>().CreateOrderAsync(order);
        await scope.ServiceProvider.GetRequiredService<IOrderTaxService>()
            .RecordOrderAsync(order, new PaymentIntentSnapshot { Id = order.PaymentIntentId, BillingCountry = "FR" }, null);

        var recorded = _factory.StripeTax.Calculations.Last(item => item.Country == "FR" && item.Lines.Any(line => line.Reference.Contains(gameId)));
        Assert.Equal("txcd_10202000", Assert.Single(recorded.Lines).TaxCode);
    }

    [Fact]
    public async Task Card_completeness_asks_software_for_category_activation_and_licenses_not_for_genres_or_age_rating()
    {
        var (incompleteId, _) = await SeedSoftwareAsync(complete: false);
        var issues = (await (await Admin().GetAsync($"/api/admin/games/{incompleteId}/completeness")).Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("issues").EnumerateArray().Select(issue => issue.GetProperty("code").GetString()).ToList();

        Assert.Contains("softwareCategory", issues);
        Assert.Contains("activation", issues);
        Assert.Contains("editionLicense", issues);
        Assert.DoesNotContain("genres", issues);
        Assert.DoesNotContain("ageRating", issues);
        Assert.DoesNotContain("trailer", issues);

        var (completeId, _) = await SeedSoftwareAsync(complete: true);
        var clean = (await (await Admin().GetAsync($"/api/admin/games/{completeId}/completeness")).Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("issues").EnumerateArray().Select(issue => issue.GetProperty("code").GetString()).ToList();
        Assert.DoesNotContain("softwareCategory", clean);
        Assert.DoesNotContain("activation", clean);
        Assert.DoesNotContain("editionLicense", clean);
    }

    [Fact]
    public async Task Card_completeness_names_the_license_that_has_no_keys()
    {
        // Ключ есть только у «1 year · 3 devices»; лицензия по умолчанию пуста.
        var (gameId, _) = await SeedSoftwareAsync();
        var issues = (await (await Admin().GetAsync($"/api/admin/games/{gameId}/completeness")).Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("issues").EnumerateArray()
            .Where(issue => issue.GetProperty("code").GetString() == "editionKeys")
            .Select(issue => issue.GetProperty("message").GetString())
            .ToList();

        var message = Assert.Single(issues);
        Assert.Contains("1 year · 1 device", message);
    }

    [Fact]
    public async Task Duplicate_copies_the_card_and_licenses_as_a_draft_without_keys()
    {
        var (gameId, slug) = await SeedSoftwareAsync();

        var response = await Admin().PostAsync($"/api/admin/games/{gameId}/duplicate", null);
        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        var copyId = created.GetProperty("id").GetString()!;
        Assert.NotEqual(gameId, copyId);
        Assert.Equal($"{slug}-copy", created.GetProperty("slug").GetString());

        using var scope = _factory.Services.CreateScope();
        var copy = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(copyId);
        Assert.Equal(ProductKind.Software, copy!.Kind);
        Assert.Equal("security", copy.SoftwareCategory);
        Assert.EndsWith("(copy)", copy.Title);

        var details = await scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>().GetByGameIdAsync(copyId);
        Assert.True(details.IsDraft);
        Assert.Equal(new[] { "1y-1", "1y-3" }, details.Editions.Select(edition => edition.Code));
        Assert.Equal(30m, details.Editions.Single(edition => edition.Code == "1y-3").Price);
        Assert.Equal("Nova account", details.Activation!.Label);

        // Ключи — про конкретный товар и не копируются.
        var stock = await scope.ServiceProvider.GetRequiredService<IGameKeyRepository>().CountAvailableByEditionForGamesAsync(new[] { copyId });
        Assert.False(stock.ContainsKey(copyId));

        // Черновик виден в списке админки, но не на витрине — и не посторонним с тем же параметром.
        var q = Uri.EscapeDataString(copy.Title);
        var adminList = await (await Admin().GetAsync($"/api/game/catalog?kind=all&includeDrafts=true&q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(adminList.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetString() == copyId && item.GetProperty("isDraft").GetBoolean());
        var publicList = await (await _factory.CreateClient().GetAsync($"/api/game/catalog?kind=all&includeDrafts=true&q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(publicList.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetString() == copyId);

        // Вторая копия не сталкивается с первой по адресу.
        var again = await (await Admin().PostAsync($"/api/admin/games/{gameId}/duplicate", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal($"{slug}-copy-2", again.GetProperty("slug").GetString());
    }

    [Fact]
    public async Task Catalog_keeps_software_in_its_own_section_with_license_price_and_filters()
    {
        var (gameId, slug) = await SeedSoftwareAsync();
        var client = _factory.CreateClient();
        var q = Uri.EscapeDataString(slug.Replace('-', ' '));

        // Старые ссылки каталога — про игры: ПО туда не просачивается.
        var games = await (await client.GetAsync($"/api/game/catalog?q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, games.GetProperty("total").GetInt32());
        Assert.Equal(1, games.GetProperty("facets").GetProperty("kinds").EnumerateArray().Single(k => k.GetProperty("value").GetString() == "Software").GetProperty("count").GetInt32());

        var software = await (await client.GetAsync($"/api/game/catalog?kind=software&softwareCategory=security&q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        var card = Assert.Single(software.GetProperty("items").EnumerateArray());
        Assert.Equal(gameId, card.GetProperty("id").GetString());
        // Ключи есть только у «1 year · 3 devices» — её цена и стоит на карточке, с пометкой «from».
        Assert.Equal("1y-3", card.GetProperty("license").GetProperty("code").GetString());
        Assert.Equal("1 year · 3 devices", card.GetProperty("license").GetProperty("label").GetString());
        // Срок и устройства отдельно: подпись на языке покупателя собирает витрина.
        Assert.Equal(12, card.GetProperty("license").GetProperty("termMonths").GetInt32());
        Assert.Equal(3, card.GetProperty("license").GetProperty("devices").GetInt32());
        Assert.Equal(30m, card.GetProperty("finalPrice").GetDecimal());
        Assert.True(card.GetProperty("priceFrom").GetBoolean());
        Assert.Equal(2, card.GetProperty("licenseCount").GetInt32());
        // «1 left» — про показанную лицензию: у неё один ключ.
        Assert.Equal(1, card.GetProperty("lowStockLeft").GetInt32());
        Assert.Equal("VendorWebsite", card.GetProperty("activation").GetString());
        Assert.Contains("Android", card.GetProperty("platforms").EnumerateArray().Select(p => p.GetString()));

        var terms = software.GetProperty("facets").GetProperty("software").GetProperty("terms").EnumerateArray().Select(t => t.GetProperty("value").GetString());
        Assert.Contains("12", terms);

        var oneDevice = await (await client.GetAsync($"/api/game/catalog?kind=software&devices=1&q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        var oneDeviceCard = Assert.Single(oneDevice.GetProperty("items").EnumerateArray());
        Assert.Equal(20m, oneDeviceCard.GetProperty("finalPrice").GetDecimal());
        // У лицензии на одно устройство ключей нет — «мало осталось» от соседней лицензии сюда не переносится.
        Assert.Equal(JsonValueKind.Null, oneDeviceCard.GetProperty("lowStockLeft").ValueKind);
    }

    [Fact]
    public async Task Home_shelves_stay_games_and_software_categories_are_counted()
    {
        var (gameId, slug) = await SeedSoftwareAsync();
        var client = _factory.CreateClient();

        var home = await (await client.GetAsync("/api/game/home")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(gameId, home.GetProperty("newReleases").EnumerateArray().Select(id => id.GetString()));
        Assert.True(home.GetProperty("totals").GetProperty("software").GetInt32() >= 1);
        // Полки «Software deals» на главной больше нет: ответ не должен тащить её список.
        Assert.False(home.TryGetProperty("softwareDeals", out _));

        var categories = await (await client.GetAsync("/api/game/software-categories")).Content.ReadFromJsonAsync<JsonElement>();
        var list = categories.GetProperty("categories").EnumerateArray().ToList();
        Assert.Equal("operating-systems", list[0].GetProperty("tag").GetString());
        Assert.True(list.Single(c => c.GetProperty("tag").GetString() == "security").GetProperty("count").GetInt32() >= 1);

        _factory.Services.GetRequiredService<Microsoft.Extensions.Caching.Memory.IMemoryCache>().Remove($"{SuperBot.WebApi.Controllers.SeoController.SitemapCacheKey}:http://localhost");
        var sitemap = await client.GetStringAsync("/sitemap.xml");
        // Раздела /software больше нет: товар ПО — по общему адресу /games/{slug}, старый адрес в карту не попадает.
        Assert.Contains($"/games/{slug}</loc>", sitemap);
        Assert.DoesNotContain("/software", sitemap);
    }

    [Fact]
    public async Task Admin_switches_kind_with_a_valid_category_and_saving_the_game_form_keeps_it()
    {
        var (gameId, _) = await SeedSoftwareAsync();
        var admin = Admin();

        // Неизвестная категория и ПО без категории — отказ, вид не меняется.
        Assert.Equal(System.Net.HttpStatusCode.BadRequest,
            (await admin.PutAsJsonAsync($"/api/admin/software/products/{gameId}/kind", new { kind = "Software", softwareCategory = "games-for-cats" })).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest,
            (await admin.PutAsJsonAsync($"/api/admin/software/products/{gameId}/kind", new { kind = "Software" })).StatusCode);

        var moved = await admin.PutAsJsonAsync($"/api/admin/software/products/{gameId}/kind", new { kind = "Software", softwareCategory = "VPN" });
        moved.EnsureSuccessStatusCode();
        Assert.Equal("vpn", (await moved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("softwareCategory").GetString());

        // Форма каталога шлёт Game целиком и о виде не знает — сохранение не должно превратить ПО в игру.
        using (var scope = _factory.Services.CreateScope())
        {
            var game = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(gameId);
            (await admin.PutAsJsonAsync($"/api/game/{gameId}", new { id = gameId, name = game!.Name, title = "Renamed", description = "desc", price = 21m, gameType = 0, slug = game.Slug, imagePath = game.ImagePath }))
                .EnsureSuccessStatusCode();
            var saved = await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetByIdAsync(gameId);
            Assert.Equal("Renamed", saved!.Title);
            Assert.Equal(ProductKind.Software, saved.Kind);
            Assert.Equal("vpn", saved.SoftwareCategory);
        }

        // Обратно в игру — категория снимается.
        var back = await admin.PutAsJsonAsync($"/api/admin/software/products/{gameId}/kind", new { kind = "Game", softwareCategory = "vpn" });
        back.EnsureSuccessStatusCode();
        var body = await back.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Game", body.GetProperty("kind").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("softwareCategory").ValueKind);
    }

    [Fact]
    public async Task Creating_software_requires_a_known_category()
    {
        var admin = Admin();
        var name = $"Prism Photo {Guid.NewGuid():N}";

        var missing = await admin.PostAsJsonAsync("/api/game", new { name, title = name, slug = $"prism-{Guid.NewGuid():N}", description = "desc", gameType = 0, price = 59m, imagePath = "cover.png", kind = 1 });
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, missing.StatusCode);

        (await admin.PostAsJsonAsync("/api/game", new { name, title = name, slug = $"prism-{Guid.NewGuid():N}", description = "desc", gameType = 0, price = 59m, imagePath = "cover.png", kind = 1, softwareCategory = "Design" }))
            .EnsureSuccessStatusCode();

        using var scope = _factory.Services.CreateScope();
        var created = (await scope.ServiceProvider.GetRequiredService<IGameRepository>().GetAllAsync()).Single(game => game.Name == name);
        Assert.Equal(ProductKind.Software, created.Kind);
        Assert.Equal("design", created.SoftwareCategory);
    }

    [Fact]
    public async Task A_product_created_as_draft_stays_out_of_the_store_until_published()
    {
        var admin = Admin();
        var name = $"Quiet Draft {Guid.NewGuid():N}";
        var response = await admin.PostAsJsonAsync("/api/game?draft=true",
            new { name, title = name, slug = $"quiet-{Guid.NewGuid():N}", description = "desc", gameType = 0, price = 9m, imagePath = "cover.png", kind = 1, softwareCategory = "vpn" });
        response.EnsureSuccessStatusCode();
        // Ответ называет созданный товар — по нему админка открывает редактор.
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        Assert.False(string.IsNullOrWhiteSpace(id));

        var q = Uri.EscapeDataString(name);
        var store = await (await _factory.CreateClient().GetAsync($"/api/game/catalog?kind=all&q={q}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, store.GetProperty("total").GetInt32());

        async Task<int> AdminCount(string status) =>
            (await (await admin.GetAsync($"/api/game/catalog?kind=all&includeDrafts=true&status={status}&q={q}")).Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("total").GetInt32();
        Assert.Equal(1, await AdminCount("draft"));
        Assert.Equal(0, await AdminCount("published"));

        // Без параметра — как раньше: товар сразу опубликован.
        var visibleName = $"Loud Product {Guid.NewGuid():N}";
        (await admin.PostAsJsonAsync("/api/game",
            new { name = visibleName, title = visibleName, slug = $"loud-{Guid.NewGuid():N}", description = "desc", gameType = 0, price = 9m, imagePath = "cover.png" }))
            .EnsureSuccessStatusCode();
        var visible = await (await _factory.CreateClient().GetAsync($"/api/game/catalog?kind=all&q={Uri.EscapeDataString(visibleName)}")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, visible.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Categories_can_be_renamed_and_reordered_but_not_removed_while_in_use()
    {
        await SeedSoftwareAsync(); // товар в «security»
        var admin = Admin();
        var original = await (await admin.GetAsync("/api/admin/software/categories")).Content.ReadFromJsonAsync<List<JsonElement>>();
        Assert.True(original!.Single(c => c.GetProperty("tag").GetString() == "security").GetProperty("count").GetInt32() >= 1);
        var restore = original.Select(c => new { tag = c.GetProperty("tag").GetString(), title = c.GetProperty("title").GetString() }).ToList();

        try
        {
            var withoutSecurity = restore.Where(c => c.tag != "security").ToList();
            var conflict = await admin.PutAsJsonAsync("/api/admin/software/categories", withoutSecurity);
            Assert.Equal(System.Net.HttpStatusCode.Conflict, conflict.StatusCode);

            Assert.Equal(System.Net.HttpStatusCode.BadRequest,
                (await admin.PutAsJsonAsync("/api/admin/software/categories", restore.Append(new { tag = "Bad Tag", title = "Bad" }))).StatusCode);
            Assert.Equal(System.Net.HttpStatusCode.BadRequest,
                (await admin.PutAsJsonAsync("/api/admin/software/categories", restore.Append(new { tag = "vpn", title = "Twice" }))).StatusCode);

            // Переименовать, переставить и добавить — можно; витрина получает новый порядок.
            var edited = new[] { new { tag = "security", title = "Security suites" } }
                .Concat(restore.Where(c => c.tag != "security"))
                .Append(new { tag = "backup", title = "Backup & sync" })
                .ToList();
            (await admin.PutAsJsonAsync("/api/admin/software/categories", edited)).EnsureSuccessStatusCode();

            var storefront = await (await _factory.CreateClient().GetAsync("/api/game/software-categories")).Content.ReadFromJsonAsync<JsonElement>();
            var tags = storefront.GetProperty("categories").EnumerateArray().ToList();
            Assert.Equal("security", tags[0].GetProperty("tag").GetString());
            Assert.Equal("Security suites", tags[0].GetProperty("title").GetString());
            Assert.Equal("backup", tags[^1].GetProperty("tag").GetString());
        }
        finally
        {
            // Настройки общие для всех тестов коллекции — возвращаем как было.
            (await admin.PutAsJsonAsync("/api/admin/software/categories", restore)).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Keys_email_shows_the_license_and_where_to_activate_a_software_key()
    {
        var (gameId, _) = await SeedSoftwareAsync();
        var email = $"sw-mail-{Guid.NewGuid():N}@taleshop.test";
        using var scope = _factory.Services.CreateScope();
        var mailer = scope.ServiceProvider.GetRequiredService<SuperBot.Core.Interfaces.IDeliveryMailer>();

        await mailer.SendGameKeysAsync(email, "TS-SW-1", new[]
        {
            new SuperBot.Core.Interfaces.DeliveredKeyNotification("Nova Security", "NOVA-AAAA-BBBB", "Nova", ProductTypes.Software, gameId, "1y-3"),
            new SuperBot.Core.Interfaces.DeliveredKeyNotification("Elden Ring", "STEAM-CCCC-DDDD", "Steam")
        });
        var mixed = _factory.Mail.LastTo(email)!;
        // Игры и ПО вперемешку — тема без «game», у ПО лицензия и место активации, у игры — как было.
        Assert.Equal("Your keys — order TS-SW-1", mixed.Subject);
        Assert.Contains("Nova Security (1 year · 3 devices): NOVA-AAAA-BBBB — activate on Nova account (https://nova.example/licenses)", mixed.TextBody);
        Assert.Contains("Elden Ring: STEAM-CCCC-DDDD", mixed.TextBody);
        Assert.Contains(System.Net.WebUtility.HtmlEncode("1 year · 3 devices"), mixed.HtmlBody);
        Assert.Contains("Nova account", mixed.HtmlBody);
        Assert.DoesNotContain(">Nova<", mixed.HtmlBody);

        await mailer.SendGameKeysAsync(email, "TS-SW-2", new[]
        {
            new SuperBot.Core.Interfaces.DeliveredKeyNotification("Nova Security", "NOVA-EEEE-FFFF", "Nova", ProductTypes.SoftwareSubscription, gameId, null)
        });
        var onlySoftware = _factory.Mail.LastTo(email)!;
        Assert.Equal("Your software keys — order TS-SW-2", onlySoftware.Subject);
        // Ключ без кода издания — ключ лицензии по умолчанию.
        Assert.Contains("(1 year · 1 device)", onlySoftware.TextBody);
    }

    [Fact]
    public async Task Account_keys_list_marks_software_with_license_and_activation()
    {
        var (gameId, _) = await SeedSoftwareAsync();
        var email = $"sw-keys-{Guid.NewGuid():N}@taleshop.test";
        using (var scope = _factory.Services.CreateScope())
        {
            var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();
            await keys.AddPoolKeysAsync(gameId, "Nova", new[] { $"NOVB-{Guid.NewGuid():N}"[..20] }, editionCode: "1y-1");
            Assert.NotNull(await keys.TryDispensePoolKeyAsync(gameId, email, editionCode: "1y-1"));
        }

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, $"u-{Guid.NewGuid():N}");
        var rows = await (await client.GetAsync("/api/users/me/keys")).Content.ReadFromJsonAsync<JsonElement>();

        var row = Assert.Single(rows.EnumerateArray());
        Assert.Equal("Software", row.GetProperty("kind").GetString());
        Assert.Equal("1 year · 1 device", row.GetProperty("license").GetString());
        Assert.Equal(12, row.GetProperty("licenseTermMonths").GetInt32());
        Assert.Equal(1, row.GetProperty("licenseDevices").GetInt32());
        Assert.False(row.GetProperty("licenseIsSubscription").GetBoolean());
        Assert.Equal("Nova account", row.GetProperty("activation").GetProperty("label").GetString());
        Assert.Equal("VendorWebsite", row.GetProperty("activation").GetProperty("target").GetString());
    }

    [Fact]
    public async Task Settings_carry_the_default_software_categories()
    {
        var settings = await (await _factory.CreateClient().GetAsync("/api/Settings")).Content.ReadFromJsonAsync<JsonElement>();
        var categories = settings.EnumerateArray().First().GetProperty("softwareCategories").EnumerateArray()
            .Select(category => category.GetProperty("tag").GetString()).ToList();

        Assert.Contains("operating-systems", categories);
        Assert.Contains("security", categories);
        Assert.Equal(6, categories.Count);
    }
}
