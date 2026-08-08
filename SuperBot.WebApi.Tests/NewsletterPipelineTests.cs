using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Newsletter;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Интеграционные тесты полного пайплайна рассылки — через реальные HTTP-эндпоинты,
/// реальный Mongo (эфемерный) и реальные сервисы; подменены только SMTP и Keycloak.
/// Покрывают путь гостя (double opt-in → кампания → отписка), путь владельца аккаунта,
/// защиту (валидация, rate-limit, роли админки) и автодайджест скидок.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class NewsletterPipelineTests
{
    private readonly TaleShopApiFactory _factory;

    public NewsletterPipelineTests(TaleShopApiFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClient(string? ip = null, string? email = null, string? roles = null)
    {
        var client = _factory.CreateClient();
        if (ip is not null)
        {
            client.DefaultRequestHeaders.Add("CF-Connecting-IP", ip);
        }
        if (email is not null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        }
        if (roles is not null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        }
        return client;
    }

    private static async Task<string> ReadStatusAsync(HttpResponseMessage response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("status").GetString() ?? "";
    }

    private async Task DrainCampaignQueueAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<INewsletterDispatcher>();
        while (await dispatcher.ProcessQueuedCampaignAsync(CancellationToken.None))
        {
        }
    }

    // ---------------------------------------------------------------
    // Гость: подписка → письмо-подтверждение → confirm → кампания →
    // письмо с ссылкой отписки → unsubscribe → следующая кампания не приходит.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Guest_full_lifecycle_subscribe_confirm_campaign_unsubscribe()
    {
        const string email = "guest-lifecycle@test.io";
        var guest = CreateClient(ip: "10.1.1.1");
        var admin = CreateClient(ip: "10.1.1.2", email: "admin@test.io", roles: "admin");

        // 1. Подписка гостя → pending + письмо с токеном подтверждения.
        var subscribeResponse = await guest.PostAsJsonAsync("/api/newsletter/subscribe",
            new { email, source = "deals" });
        Assert.Equal(HttpStatusCode.OK, subscribeResponse.StatusCode);
        Assert.Equal("pending", await ReadStatusAsync(subscribeResponse));

        var confirmMail = _factory.Mail.LastTo(email);
        Assert.NotNull(confirmMail);
        Assert.Contains("Confirm", confirmMail!.Subject);
        var confirmToken = CapturingMailSender.ExtractToken(confirmMail, "/newsletter/confirm");

        // 2. Подтверждение по токену из письма.
        var confirmResponse = await guest.PostAsJsonAsync("/api/newsletter/confirm", new { token = confirmToken });
        Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);

        // Повторное использование токена — уже невалидно (одноразовый).
        var confirmAgain = await guest.PostAsJsonAsync("/api/newsletter/confirm", new { token = confirmToken });
        Assert.Equal(HttpStatusCode.NotFound, confirmAgain.StatusCode);

        // 3. Админ видит подписчика как confirmed.
        var listResponse = await admin.GetAsync($"/api/admin/newsletter/subscribers?search={email}");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var list = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var item = list.GetProperty("items").EnumerateArray().Single();
        Assert.Equal("confirmed", item.GetProperty("status").GetString());
        Assert.Equal("deals", item.GetProperty("sources").EnumerateArray().Single().GetString());

        // 4. Админ ставит кампанию, воркер (диспетчер) отправляет.
        var campaignResponse = await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns",
            new { subject = "Big summer sale", body = "Everything is on sale!" });
        Assert.Equal(HttpStatusCode.OK, campaignResponse.StatusCode);

        await DrainCampaignQueueAsync();

        var campaignMail = _factory.Mail.LastTo(email);
        Assert.NotNull(campaignMail);
        Assert.Equal("Big summer sale", campaignMail!.Subject);
        Assert.Contains("Everything is on sale!", campaignMail.TextBody);
        Assert.Contains("Unsubscribe", campaignMail.TextBody);

        // 5. Отписка по ссылке из футера письма.
        var unsubscribeToken = CapturingMailSender.ExtractToken(campaignMail, "/newsletter/unsubscribe");
        var unsubscribeResponse = await guest.PostAsJsonAsync("/api/newsletter/unsubscribe",
            new { token = unsubscribeToken });
        Assert.Equal(HttpStatusCode.OK, unsubscribeResponse.StatusCode);

        // 6. Следующая кампания отписанному не уходит.
        var mailsBefore = _factory.Mail.AllTo(email).Count;
        await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns",
            new { subject = "After unsubscribe", body = "Should not arrive" });
        await DrainCampaignQueueAsync();
        Assert.Equal(mailsBefore, _factory.Mail.AllTo(email).Count);

        // 7. Статус кампании в истории — sent, счётчики заполнены.
        var campaignsResponse = await admin.GetAsync("/api/admin/newsletter/campaigns");
        var campaigns = await campaignsResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sentCampaign = campaigns.EnumerateArray()
            .Single(c => c.GetProperty("subject").GetString() == "Big summer sale");
        Assert.Equal("sent", sentCampaign.GetProperty("status").GetString());
        Assert.True(sentCampaign.GetProperty("sentCount").GetInt32() >= 1);
    }

    // ---------------------------------------------------------------
    // Владелец аккаунта: подписка своим email подтверждается мгновенно,
    // личный кабинет управляет той же записью (/me).
    // ---------------------------------------------------------------
    [Fact]
    public async Task Account_owner_subscribes_instantly_and_manages_via_me()
    {
        const string email = "account-owner@test.io";
        var user = CreateClient(ip: "10.2.2.1", email: email);

        // Подписка своим email → confirmed сразу, письмо-подтверждение НЕ отправляется.
        var subscribeResponse = await user.PostAsJsonAsync("/api/newsletter/subscribe",
            new { email, source = "homepage" });
        Assert.Equal("confirmed", await ReadStatusAsync(subscribeResponse));
        Assert.Null(_factory.Mail.LastTo(email));

        // Кабинет видит подписку.
        var me = await user.GetFromJsonAsync<JsonElement>("/api/newsletter/me");
        Assert.True(me.GetProperty("subscribed").GetBoolean());

        // Выключение из кабинета.
        var turnOff = await user.PutAsJsonAsync("/api/newsletter/me", new { subscribed = false });
        Assert.Equal(HttpStatusCode.OK, turnOff.StatusCode);
        me = await user.GetFromJsonAsync<JsonElement>("/api/newsletter/me");
        Assert.False(me.GetProperty("subscribed").GetBoolean());
        Assert.Equal("unsubscribed", me.GetProperty("status").GetString());

        // Включение обратно — снова confirmed, без double opt-in.
        await user.PutAsJsonAsync("/api/newsletter/me", new { subscribed = true });
        me = await user.GetFromJsonAsync<JsonElement>("/api/newsletter/me");
        Assert.True(me.GetProperty("subscribed").GetBoolean());

        // Анонимный доступ к /me закрыт.
        var anonymous = CreateClient(ip: "10.2.2.2");
        var anonymousMe = await anonymous.GetAsync("/api/newsletter/me");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousMe.StatusCode);
    }

    // ---------------------------------------------------------------
    // Валидация входа и токенов.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Invalid_email_and_tokens_are_rejected()
    {
        var client = CreateClient(ip: "10.3.3.1");

        var badEmail = await client.PostAsJsonAsync("/api/newsletter/subscribe",
            new { email = "not-an-email", source = "deals" });
        Assert.Equal(HttpStatusCode.BadRequest, badEmail.StatusCode);

        var badConfirm = await client.PostAsJsonAsync("/api/newsletter/confirm",
            new { token = "deadbeef" });
        Assert.Equal(HttpStatusCode.NotFound, badConfirm.StatusCode);

        var badUnsubscribe = await client.PostAsJsonAsync("/api/newsletter/unsubscribe",
            new { token = "deadbeef" });
        Assert.Equal(HttpStatusCode.NotFound, badUnsubscribe.StatusCode);
    }

    // ---------------------------------------------------------------
    // Анти-спам: не больше 6 подписок с одного IP в час.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Subscribe_is_rate_limited_per_ip()
    {
        var client = CreateClient(ip: "10.4.4.4");

        for (var i = 0; i < 6; i++)
        {
            var ok = await client.PostAsJsonAsync("/api/newsletter/subscribe",
                new { email = $"rate-limit-{i}@test.io", source = "deals" });
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        }

        var overLimit = await client.PostAsJsonAsync("/api/newsletter/subscribe",
            new { email = "rate-limit-7@test.io", source = "deals" });
        Assert.Equal(HttpStatusCode.TooManyRequests, overLimit.StatusCode);
    }

    // ---------------------------------------------------------------
    // Админ-эндпоинты закрыты ролями.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Admin_endpoints_require_admin_role()
    {
        var anonymous = CreateClient(ip: "10.5.5.1");
        var anonymousResponse = await anonymous.GetAsync("/api/admin/newsletter/stats");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        var regularUser = CreateClient(ip: "10.5.5.2", email: "mortal@test.io");
        var forbiddenResponse = await regularUser.GetAsync("/api/admin/newsletter/stats");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        var admin = CreateClient(ip: "10.5.5.3", email: "admin@test.io", roles: "admin");
        var okResponse = await admin.GetAsync("/api/admin/newsletter/stats");
        Assert.Equal(HttpStatusCode.OK, okResponse.StatusCode);
    }

    // ---------------------------------------------------------------
    // Автодайджест: новая активная скидка → кампания в очереди → письмо
    // с названием игры и процентом уходит подтверждённым подписчикам.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Deals_digest_is_queued_and_delivered_to_confirmed_subscribers()
    {
        const string email = "digest-reader@test.io";
        using var scope = _factory.Services.CreateScope();
        var newsletter = scope.ServiceProvider.GetRequiredService<INewsletterService>();
        var dispatcher = scope.ServiceProvider.GetRequiredService<INewsletterDispatcher>();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var discountRepository = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();

        // Подтверждённый подписчик (как из кабинета).
        await newsletter.SetForAccountAsync(email, "digest-user-id", subscribed: true, CancellationToken.None);

        // Игра со скидкой, стартовавшей час назад.
        var game = new Game
        {
            Slug = "digest-game",
            Name = "Digest Game",
            Title = "Digest Quest",
            Description = "Integration test game",
            Price = 50m,
            GameType = GameType.Strategy,
            ImagePath = "",
            ReleaseDate = DateTime.UtcNow.AddYears(-1),
        };
        await gameRepository.CreateAsync(game);
        var created = (await gameRepository.GetAllAsync()).Single(g => g.Slug == "digest-game");
        await discountRepository.UpsertAsync(new GameDiscount
        {
            GameId = created.Id!,
            DiscountPercent = 40m,
            StartDate = DateTime.UtcNow.AddHours(-1),
            EndDate = DateTime.UtcNow.AddDays(3),
        });

        // Прошлый прогон дайджеста — 25 часов назад (интервал в сутки прошёл).
        await newsletter.State.ReplaceOneAsync(
            s => s.Id == "deals-digest",
            new NewsletterStateDb { Id = "deals-digest", LastRunAt = DateTime.UtcNow.AddHours(-25) },
            new ReplaceOptions { IsUpsert = true });

        // Дайджест ставится в очередь и отправляется.
        var queued = await dispatcher.MaybeQueueDealsDigestAsync(CancellationToken.None);
        Assert.True(queued);
        await DrainCampaignQueueAsync();

        var digestMail = _factory.Mail.AllTo(email)
            .LastOrDefault(mail => mail.Subject.Contains("deal", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(digestMail);
        Assert.Contains("Digest Quest", digestMail!.TextBody);
        Assert.Contains("-40%", digestMail.TextBody);
        Assert.Contains("/deals", digestMail.TextBody);
        Assert.Contains("Unsubscribe", digestMail.TextBody);

        // Повторный вызов сразу же — окно ещё не прошло, дайджест не дублируется.
        var queuedAgain = await dispatcher.MaybeQueueDealsDigestAsync(CancellationToken.None);
        Assert.False(queuedAgain);
    }

    // ---------------------------------------------------------------
    // HTML-версии писем: кнопка подтверждения и ссылки — настоящие <a>,
    // markdown-лайт из кампании рендерится, unsubscribe-футер кликабелен.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Emails_are_branded_html_with_clickable_links()
    {
        const string email = "html-links@test.io";
        var guest = CreateClient(ip: "10.6.6.1");
        var admin = CreateClient(ip: "10.6.6.2", email: "admin@test.io", roles: "admin");

        await guest.PostAsJsonAsync("/api/newsletter/subscribe", new { email, source = "deals" });
        var confirmMail = _factory.Mail.LastTo(email);
        Assert.NotNull(confirmMail?.HtmlBody);
        Assert.Contains("<a href=\"http://taleshop.test/newsletter/confirm?token=", confirmMail!.HtmlBody);
        Assert.Contains("Confirm subscription", confirmMail.HtmlBody);

        var token = CapturingMailSender.ExtractToken(confirmMail, "/newsletter/confirm");
        var confirmed = await guest.PostAsJsonAsync("/api/newsletter/confirm", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);

        await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns", new
        {
            subject = "Markdown campaign",
            body = "**Hot picks** this week!\n- [All deals](http://taleshop.test/deals)\nMore at http://taleshop.test/faq",
        });
        await DrainCampaignQueueAsync();

        var campaignMail = _factory.Mail.AllTo(email).LastOrDefault(m => m.Subject == "Markdown campaign");
        Assert.NotNull(campaignMail?.HtmlBody);
        var html = campaignMail!.HtmlBody!;
        Assert.Contains("<strong>Hot picks</strong>", html);
        Assert.Contains("<a href=\"http://taleshop.test/deals\"", html);
        Assert.Contains("<a href=\"http://taleshop.test/faq\"", html);
        Assert.Contains("• ", html); // "- " в начале строки → маркер списка
        Assert.Contains("/newsletter/unsubscribe?token=", html);
        Assert.Contains(">Unsubscribe</a>", html);
    }

    // ---------------------------------------------------------------
    // Предпросмотр в админке: рендер тем же кодом, сырой HTML экранируется (анти-XSS).
    // ---------------------------------------------------------------
    [Fact]
    public async Task Campaign_preview_renders_markdown_and_escapes_raw_html()
    {
        var admin = CreateClient(ip: "10.7.7.1", email: "admin@test.io", roles: "admin");
        var response = await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns/preview", new
        {
            body = "**Bold** [link](https://example.com) <script>alert(1)</script>",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var html = json.GetProperty("html").GetString()!;
        Assert.Contains("<strong>Bold</strong>", html);
        Assert.Contains("<a href=\"https://example.com\"", html);
        Assert.DoesNotContain("<script>", html);
        Assert.Contains("Unsubscribe", html); // футер показан на примере подписчика

        var mortal = CreateClient(ip: "10.7.7.2", email: "mortal@test.io");
        var forbidden = await mortal.PostAsJsonAsync("/api/admin/newsletter/campaigns/preview", new { body = "x" });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    // ---------------------------------------------------------------
    // Планировщик: кампания с ScheduledAt в будущем лежит в очереди и не отправляется,
    // пока её время не пришло; время в прошлом отклоняется на входе.
    // ---------------------------------------------------------------
    [Fact]
    public async Task Scheduled_campaign_is_not_sent_before_its_time()
    {
        const string email = "scheduled-reader@test.io";
        using var scope = _factory.Services.CreateScope();
        var newsletter = scope.ServiceProvider.GetRequiredService<INewsletterService>();
        await newsletter.SetForAccountAsync(email, "scheduled-user-id", subscribed: true, CancellationToken.None);

        var admin = CreateClient(ip: "10.8.8.1", email: "admin@test.io", roles: "admin");

        var past = await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns",
            new { subject = "Too late", body = "x", scheduledAt = DateTime.UtcNow.AddHours(-1) });
        Assert.Equal(HttpStatusCode.BadRequest, past.StatusCode);

        var create = await admin.PostAsJsonAsync("/api/admin/newsletter/campaigns",
            new { subject = "Scheduled sale", body = "Starts later", scheduledAt = DateTime.UtcNow.AddHours(2) });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);

        // Очередь «пуста» для диспетчера: время кампании не пришло.
        await DrainCampaignQueueAsync();
        Assert.Null(_factory.Mail.AllTo(email).LastOrDefault(m => m.Subject == "Scheduled sale"));

        var campaigns = await admin.GetFromJsonAsync<JsonElement>("/api/admin/newsletter/campaigns");
        var scheduled = campaigns.EnumerateArray().Single(c => c.GetProperty("subject").GetString() == "Scheduled sale");
        Assert.Equal("queued", scheduled.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, scheduled.GetProperty("scheduledAt").ValueKind);

        // «Наступило время» — в реальности это делает ход часов, в тесте сдвигаем ScheduledAt.
        await newsletter.Campaigns.UpdateOneAsync(
            c => c.Subject == "Scheduled sale",
            Builders<NewsletterCampaignDb>.Update.Set(c => c.ScheduledAt, DateTime.UtcNow.AddMinutes(-1)));

        await DrainCampaignQueueAsync();
        Assert.NotNull(_factory.Mail.AllTo(email).LastOrDefault(m => m.Subject == "Scheduled sale"));
    }

    // ---------------------------------------------------------------
    // Локализация системных писем: подтверждение — на языке сайта на момент
    // подписки; дайджест — отдельная кампания на каждый язык, без кросс-языковых писем.
    // ---------------------------------------------------------------
    [Fact]
    public async Task System_emails_are_localized_per_subscriber()
    {
        const string ruEmail = "ru-reader@test.io";
        const string enEmail = "en-reader@test.io";
        var guestRu = CreateClient(ip: "10.9.9.1");
        var guestEn = CreateClient(ip: "10.9.9.2");

        // Письмо-подтверждение на языке подписки.
        await guestRu.PostAsJsonAsync("/api/newsletter/subscribe", new { email = ruEmail, source = "deals", locale = "ru" });
        var ruConfirm = _factory.Mail.LastTo(ruEmail);
        Assert.NotNull(ruConfirm);
        Assert.Equal("Подтвердите подписку на Tale Shop", ruConfirm!.Subject);
        Assert.Contains("Подтвердить подписку:", ruConfirm.TextBody);

        await guestEn.PostAsJsonAsync("/api/newsletter/subscribe", new { email = enEmail, source = "deals", locale = "en" });
        var enConfirm = _factory.Mail.LastTo(enEmail);
        Assert.NotNull(enConfirm);
        Assert.Equal("Confirm your Tale Shop subscription", enConfirm!.Subject);

        await guestRu.PostAsJsonAsync("/api/newsletter/confirm",
            new { token = CapturingMailSender.ExtractToken(ruConfirm, "/newsletter/confirm") });
        await guestEn.PostAsJsonAsync("/api/newsletter/confirm",
            new { token = CapturingMailSender.ExtractToken(enConfirm, "/newsletter/confirm") });

        // Свежая скидка + прошедший суточный интервал дайджеста.
        using var scope = _factory.Services.CreateScope();
        var newsletter = scope.ServiceProvider.GetRequiredService<INewsletterService>();
        var dispatcher = scope.ServiceProvider.GetRequiredService<INewsletterDispatcher>();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var discountRepository = scope.ServiceProvider.GetRequiredService<IGameDiscountRepository>();

        await gameRepository.CreateAsync(new Game
        {
            Slug = "localized-game",
            Name = "Localized Game",
            Title = "Localized Quest",
            Description = "Integration test game (localization)",
            Price = 30m,
            GameType = GameType.Action,
            ImagePath = "",
            ReleaseDate = DateTime.UtcNow.AddYears(-1),
        });
        var created = (await gameRepository.GetAllAsync()).Single(g => g.Slug == "localized-game");
        await discountRepository.UpsertAsync(new GameDiscount
        {
            GameId = created.Id!,
            DiscountPercent = 30m,
            StartDate = DateTime.UtcNow.AddMinutes(-30),
            EndDate = DateTime.UtcNow.AddDays(2),
        });

        await newsletter.State.ReplaceOneAsync(
            s => s.Id == "deals-digest",
            new NewsletterStateDb { Id = "deals-digest", LastRunAt = DateTime.UtcNow.AddHours(-25) },
            new ReplaceOptions { IsUpsert = true });

        Assert.True(await dispatcher.MaybeQueueDealsDigestAsync(CancellationToken.None));
        await DrainCampaignQueueAsync();

        // Русскому — русский дайджест с русским футером отписки.
        var ruDigest = _factory.Mail.AllTo(ruEmail).LastOrDefault(m => m.Subject.Contains("свежие скидки"));
        Assert.NotNull(ruDigest);
        Assert.Contains("Localized Quest", ruDigest!.TextBody);
        Assert.Contains("Все скидки:", ruDigest.TextBody);
        Assert.Contains("Отписаться:", ruDigest.TextBody);

        // Англоязычному — английский, с той же игрой.
        var enDigest = _factory.Mail.AllTo(enEmail).LastOrDefault(m => m.Subject.Contains("fresh deals"));
        Assert.NotNull(enDigest);
        Assert.Contains("Localized Quest", enDigest!.TextBody);

        // Кросс-языковых писем нет: русский подписчик не получает английскую версию.
        Assert.DoesNotContain(_factory.Mail.AllTo(ruEmail), m => m.Subject.Contains("fresh deals"));
    }
}
