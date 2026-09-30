using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using SuperBot.Infrastructure.Data;
using SuperBot.WebApi.Services.ReviewInvites;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Приглашение оставить отзыв — от заказа в базе до письма.
///
/// Правила отбора проверены отдельно и без базы (ReviewInviteRulesTests); здесь важно другое:
/// что сервис действительно находит заказ, строит письмо с рабочими ссылками и, главное,
/// не пишет второй раз. «Одно письмо на заказ» — обещание, которое нельзя проверить чтением
/// кода: оно держится на отметке в базе и уникальном индексе.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ReviewInviteMailTests
{
    private readonly TaleShopApiFactory _factory;

    public ReviewInviteMailTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task<string> SeedDeliveredOrderAsync(string email, int deliveredDaysAgo = 10)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IMongoDatabase>().GetCollection<OrderDb>("Orders");

        var id = Guid.NewGuid();
        var delivered = DateTime.UtcNow.AddDays(-deliveredDaysAgo);
        await orders.InsertOneAsync(new OrderDb
        {
            OrderGuid = id,
            OrderId = id.ToString(),
            OrderNumber = $"TS-{id.ToString("N")[..6]}",
            UserId = "user-review-invite",
            UserName = email,
            IsPaid = true,
            PaidAt = delivered,
            OrderDate = delivered,
            CreatedAt = delivered,
            GameId = "game-portal",
            Items = new List<OrderItemSnapshotDb>
            {
                new()
                {
                    GameId = "game-portal",
                    Title = "Portal 2",
                    Slug = "portal-2",
                    Quantity = 1,
                    Delivery = new DeliverySnapshotDb
                    {
                        DeliveryType = "Key",
                        DeliveredAt = delivered,
                        Keys = new List<DeliveredKeyDb> { new() { KeyMasked = "AAA-***", DeliveredAt = delivered } }
                    }
                }
            }
        });

        return id.ToString();
    }

    private ReviewInviteService Service(IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<ReviewInviteService>();

    [Fact]
    public async Task Writes_once_and_links_straight_to_the_reviews_tab()
    {
        var email = $"invite-{Guid.NewGuid():N}@example.com";
        await SeedDeliveredOrderAsync(email);
        _factory.Mail.Clear();

        using (var scope = _factory.Services.CreateScope())
        {
            var result = await Service(scope).RunAsync();
            Assert.True(result.Enabled);
            Assert.True(result.Sent >= 1);
        }

        var mail = _factory.Mail.LastTo(email);
        Assert.NotNull(mail);
        Assert.Contains("Portal 2", mail!.Subject);
        Assert.Contains("/games/portal-2?tab=reviews", mail.TextBody);
        Assert.Contains("/games/portal-2?tab=reviews", mail.HtmlBody ?? string.Empty);

        // Отписка обязана быть в обеих версиях письма: без неё это просто рассылка.
        Assert.Contains("/reviews/unsubscribe?token=", mail.TextBody);
        Assert.Contains("/reviews/unsubscribe?token=", mail.HtmlBody ?? string.Empty);

        // Второй прогон по тому же заказу молчит.
        _factory.Mail.Clear();
        using (var scope = _factory.Services.CreateScope())
        {
            await Service(scope).RunAsync();
        }

        Assert.Null(_factory.Mail.LastTo(email));
    }

    [Fact]
    public async Task Does_not_write_to_someone_who_asked_not_to_be_asked()
    {
        var email = $"optout-{Guid.NewGuid():N}@example.com";
        await SeedDeliveredOrderAsync(email);
        _factory.Mail.Clear();

        using (var scope = _factory.Services.CreateScope())
        {
            var tokens = scope.ServiceProvider.GetRequiredService<IReviewInviteTokenService>();
            var accepted = await Service(scope).OptOutAsync(tokens.CreateToken(email));
            Assert.True(accepted);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            await Service(scope).RunAsync();
        }

        Assert.Null(_factory.Mail.LastTo(email));
    }

    [Fact]
    public async Task Waits_before_asking()
    {
        var email = $"fresh-{Guid.NewGuid():N}@example.com";
        await SeedDeliveredOrderAsync(email, deliveredDaysAgo: 1);
        _factory.Mail.Clear();

        using (var scope = _factory.Services.CreateScope())
        {
            await Service(scope).RunAsync();
        }

        Assert.Null(_factory.Mail.LastTo(email));
    }

    [Fact]
    public async Task A_forged_unsubscribe_link_is_refused()
    {
        using var scope = _factory.Services.CreateScope();
        Assert.False(await Service(scope).OptOutAsync("deadbeef"));
        Assert.False(await Service(scope).OptOutAsync(string.Empty));
    }
}
