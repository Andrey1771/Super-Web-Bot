using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Карты в личном кабинете.
///
/// Главное правило: клиент в Stripe заводится тогда, когда есть что к нему привязать, а не
/// при открытии страницы. Раньше «покажи мои карты» создавало клиента каждому зашедшему —
/// человеку, который ничего не купит, заводился объект в чужом сервисе с его именем и почтой,
/// а сама страница переставала работать, когда Stripe недоступен.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BillingPaymentMethodsTests
{
    // Фабрика и её Mongo общие на класс, поэтому у каждого теста свой покупатель.
    private readonly string _userEmail = $"billing-{Guid.NewGuid():N}@taleshop.test";
    private readonly string _userSub = $"user-{Guid.NewGuid():N}";

    private readonly TaleShopApiFactory _factory;

    public BillingPaymentMethodsTests(TaleShopApiFactory factory)
    {
        _factory = factory;
        _factory.StripeCustomers.Reset();
    }

    private HttpClient CreateClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, _userEmail);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, _userSub);
        return client;
    }

    /// <summary>Идентификатор клиента Stripe, записанный в профиль (null — не заводился).</summary>
    private async Task<string?> StripeCustomerIdAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var profiles = scope.ServiceProvider.GetRequiredService<IBillingProfileRepository>();
        var profile = await profiles.GetByUserIdAsync(_userSub);
        return profile?.StripeCustomerId;
    }

    [Fact]
    public async Task OpeningTheAccount_doesNotCreateAStripeCustomer()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/billing/payment-methods");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(await response.Content.ReadFromJsonAsync<PaymentMethodPayload[]>() ?? []);
        // Ни одного обращения наружу: ответ «карт нет» известен по пустому StripeCustomerId
        // в своей базе, спрашивать о нём Stripe незачем.
        Assert.Equal(0, _factory.StripeCustomers.CallCount);
        Assert.Null(await StripeCustomerIdAsync());
    }

    [Fact]
    public async Task ListingCardsRepeatedly_neverReachesStripe_whileThereAreNone()
    {
        var client = CreateClient();

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var response = await client.GetAsync("/api/billing/payment-methods");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        // Именно поэтому кабинет продолжает работать, когда Stripe недоступен.
        Assert.Equal(0, _factory.StripeCustomers.CallCount);
    }

    [Fact]
    public async Task AddingACard_createsTheCustomerOnce_withAStableIdempotencyKey()
    {
        var client = CreateClient();

        var first = await client.PostAsync("/api/billing/payment-methods/setup-intent", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var customerId = await StripeCustomerIdAsync();
        Assert.False(string.IsNullOrWhiteSpace(customerId));

        // Второй заход привязки — клиент уже есть, заводить второго нельзя.
        var second = await client.PostAsync("/api/billing/payment-methods/setup-intent", null);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        Assert.Equal(1, _factory.StripeCustomers.CreateCustomerCount);
        Assert.Equal(customerId, await StripeCustomerIdAsync());
        Assert.Contains($"billing-customer:{_userSub}", _factory.StripeCustomers.IdempotencyKeys);
    }

    [Fact]
    public async Task SavedCards_areListedWithTheDefaultMarked()
    {
        var client = CreateClient();
        await client.PostAsync("/api/billing/payment-methods/setup-intent", null);
        var customerId = await StripeCustomerIdAsync()!;

        var card = _factory.StripeCustomers.GivenCard(customerId!);
        await client.PostAsJsonAsync("/api/billing/payment-methods/set-default", new { paymentMethodId = card.Id });

        var methods = await client.GetFromJsonAsync<PaymentMethodPayload[]>("/api/billing/payment-methods");

        var listed = Assert.Single(methods!);
        Assert.Equal(card.Id, listed.Id);
        Assert.Equal("4242", listed.Last4);
        Assert.True(listed.IsDefault);
    }

    [Fact]
    public async Task SetDefault_withoutAnySavedCard_isNotFound_andCreatesNoCustomer()
    {
        var client = CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/billing/payment-methods/set-default",
            new { paymentMethodId = "pm_whatever" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(await StripeCustomerIdAsync());
    }

    [Fact]
    public async Task Deleting_withoutAnySavedCard_isNotFound_andCreatesNoCustomer()
    {
        var client = CreateClient();

        var response = await client.DeleteAsync("/api/billing/payment-methods/pm_whatever");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(await StripeCustomerIdAsync());
    }

    [Fact]
    public async Task DeletingSomeoneElsesCard_isRefused()
    {
        var client = CreateClient();
        await client.PostAsync("/api/billing/payment-methods/setup-intent", null);

        // Карта соседа: идентификатор известен, но клиент чужой.
        var strangersCard = _factory.StripeCustomers.GivenCard("cus_someone_else");

        var response = await client.DeleteAsync($"/api/billing/payment-methods/{strangersCard.Id}");

        // 404, а не 403: ответ не должен подсказывать, какие идентификаторы существуют.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain(strangersCard.Id, _factory.StripeCustomers.DetachedCards);
        Assert.True(_factory.StripeCustomers.Cards.ContainsKey(strangersCard.Id));
    }

    [Fact]
    public async Task DeletingOwnCard_detachesIt_andMovesTheDefaultToWhatIsLeft()
    {
        var client = CreateClient();
        await client.PostAsync("/api/billing/payment-methods/setup-intent", null);
        var customerId = (await StripeCustomerIdAsync())!;

        var first = _factory.StripeCustomers.GivenCard(customerId, "pm_aaa");
        var second = _factory.StripeCustomers.GivenCard(customerId, "pm_bbb");
        await client.PostAsJsonAsync("/api/billing/payment-methods/set-default", new { paymentMethodId = first.Id });

        var response = await client.DeleteAsync($"/api/billing/payment-methods/{first.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(first.Id, _factory.StripeCustomers.DetachedCards);

        // Карта по умолчанию удалена — её место занимает оставшаяся, иначе у человека
        // остались бы карты, но ни одной выбранной.
        var methods = await client.GetFromJsonAsync<PaymentMethodPayload[]>("/api/billing/payment-methods");
        var listed = Assert.Single(methods!);
        Assert.Equal(second.Id, listed.Id);
        Assert.True(listed.IsDefault);
    }

    [Fact]
    public async Task Anonymous_getsUnauthorized_andNothingIsCreated()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/billing/payment-methods");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, _factory.StripeCustomers.CallCount);
    }

    private class PaymentMethodPayload
    {
        public string Id { get; set; } = string.Empty;
        public string Brand { get; set; } = string.Empty;
        public string Last4 { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
    }
}
