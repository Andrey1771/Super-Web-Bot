using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Счета в Billing и «Download my data» — по настоящим заказам (Orders). Раньше оба читали старую коллекцию
/// SteamOrders, в которую магазин давно не пишет: счетов и заказов в выгрузке не было ни у кого.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BillingInvoicesAndExportTests
{
    private readonly TaleShopApiFactory _factory;
    private readonly string _owner = $"invoices-{Guid.NewGuid():N}@taleshop.test";
    private readonly string _ownerSub = $"user-{Guid.NewGuid():N}";

    public BillingInvoicesAndExportTests(TaleShopApiFactory factory)
    {
        _factory = factory;
        _factory.StripeCustomers.Reset();
    }

    private HttpClient AsOwner()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, _owner);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubHeader, _ownerSub);
        return client;
    }

    private async Task<Guid> SeedOrderAsync(string email, bool paid, decimal total, string title)
    {
        using var scope = _factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var id = Guid.NewGuid();
        await orders.CreateOrderAsync(new Order
        {
            Id = id, OrderNumber = $"TS-INV-{Guid.NewGuid():N}"[..14], UserId = email, UserName = email, GameName = title,
            IsPaid = paid, OrderDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, PaidAt = paid ? DateTime.UtcNow : null,
            Status = paid ? "DELIVERED" : "PENDING", PaymentStatus = paid ? "PAID" : "PENDING", Currency = "USD",
            TotalAmount = total, Totals = new MoneyTotals { Total = total },
            Items =
            {
                new OrderItemSnapshot
                {
                    Title = title, Quantity = 1, UnitPrice = total, FinalUnitPrice = total, LineTotal = total,
                    Delivery = new DeliverySnapshot
                    {
                        DeliveryType = "Key", DeliveredAt = DateTime.UtcNow,
                        Keys = { new DeliveredKey { KeyMasked = "•••••-•••••-SECRT", DeliveredAt = DateTime.UtcNow } }
                    }
                }
            }
        });
        return id;
    }

    [Fact]
    public async Task Invoices_list_own_paid_orders_and_hide_others()
    {
        var paid = await SeedOrderAsync(_owner, paid: true, total: 19.99m, "Paid Game");
        await SeedOrderAsync(_owner, paid: false, total: 5m, "Unpaid Game");
        var foreign = await SeedOrderAsync($"other-{Guid.NewGuid():N}@taleshop.test", paid: true, total: 7m, "Foreign Game");

        var page = await AsOwner().GetFromJsonAsync<JsonElement>("/api/billing/invoices");
        var item = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal(paid.ToString(), item.GetProperty("id").GetString());
        Assert.Equal(19.99m, item.GetProperty("amount").GetDecimal());
        Assert.Equal(1, page.GetProperty("totalCount").GetInt32());

        var pdf = await AsOwner().GetAsync($"/api/billing/invoices/{paid}/pdf");
        Assert.Equal(HttpStatusCode.OK, pdf.StatusCode);
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.Contains("Paid Game", await pdf.Content.ReadAsStringAsync());

        // Чужой счёт — «не найден», а не «запрещено»: не подсказываем, что такой заказ есть.
        Assert.Equal(HttpStatusCode.NotFound, (await AsOwner().GetAsync($"/api/billing/invoices/{foreign}/pdf")).StatusCode);
    }

    [Fact]
    public async Task Data_export_contains_own_paid_orders_without_keys_and_writes_nothing()
    {
        await SeedOrderAsync(_owner, paid: true, total: 12m, "Exported Game");
        await SeedOrderAsync($"other-{Guid.NewGuid():N}@taleshop.test", paid: true, total: 3m, "Foreign Export Game");

        var response = await AsOwner().GetAsync("/api/account/data-export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var zip = new ZipArchive(await response.Content.ReadAsStreamAsync());
        using var reader = new StreamReader(zip.GetEntry("data-export.json")!.Open());
        var json = await reader.ReadToEndAsync();
        var export = JsonSerializer.Deserialize<JsonElement>(json);

        var order = Assert.Single(export.GetProperty("Orders").EnumerateArray());
        Assert.Equal("Exported Game", order.GetProperty("Items")[0].GetProperty("Title").GetString());
        Assert.DoesNotContain("Foreign Export Game", json);
        // Ключи на сайте открываются только по паролю — архив их не выдаёт, даже маской.
        Assert.DoesNotContain("SECRT", json);
        Assert.DoesNotContain("HideOwnedGames", json);

        // Скачивание ничего не записывает: профиль оплаты не заводится, Stripe не трогается.
        using var scope = _factory.Services.CreateScope();
        Assert.Null(await scope.ServiceProvider.GetRequiredService<IBillingProfileRepository>().GetByUserIdAsync(_ownerSub));
        Assert.Equal(0, _factory.StripeCustomers.CallCount);
    }
}
