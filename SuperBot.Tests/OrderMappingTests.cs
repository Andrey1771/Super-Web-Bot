using System;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Mapping;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Перенос заказа в документ базы.
///
/// Тест появился после случая, который стоил покупателю оплаченного заказа: у заказа завели
/// поле «первое касание» (откуда человек пришёл), но пары для него в профиле AutoMapper не
/// создали. Сборка проходила, тесты проходили, большинство заказов оформлялось — ломалось
/// только тогда, когда браузер действительно прислал метки перехода. То есть на живой покупке,
/// уже ПОСЛЕ списания денег: заказ не создавался, а человек видел «не удалось оформить».
///
/// Поэтому проверяем не «карта объявлена», а что заказ со всеми заполненными вложенными
/// объектами реально превращается в документ и обратно. Сейчас пары вложенных типов строит
/// Mapperly при сборке, но проверка через тот же IMapper, что у репозиториев, осталась.
/// </summary>
public class OrderMappingTests
{
    private static IMapper CreateMapper() => new ObjectMapper();

    private static Order OrderWithEverythingFilled() => new()
    {
        Id = Guid.NewGuid(),
        OrderGuid = Guid.NewGuid(),
        UserId = "buyer@example.com",
        UserName = "buyer@example.com",
        OrderDate = new DateTime(2026, 8, 31, 15, 41, 0, DateTimeKind.Utc),
        CreatedAt = new DateTime(2026, 8, 31, 15, 41, 0, DateTimeKind.Utc),
        Status = "AWAITING_KEYS",
        Currency = "USD",
        TotalAmount = 240.77m,
        Totals = new MoneyTotals { Subtotal = 240.77m, DiscountTotal = 0m, TaxTotal = 0m, Total = 240.77m },
        Attribution = new OrderAttribution
        {
            Source = "google",
            Medium = "organic",
            Campaign = "summer",
            Referrer = "https://google.com/search",
            LandingPath = "/games/portal-2",
            FirstSeenUtc = new DateTime(2026, 8, 30, 10, 0, 0, DateTimeKind.Utc)
        },
        Events = new List<OrderEvent> { new() { Type = "created", Message = "Order created", CreatedAt = DateTime.UtcNow } },
        Items = new List<OrderItemSnapshot>
        {
            new()
            {
                GameId = "game-1",
                Title = "Portal 2",
                Quantity = 1,
                UnitPrice = 240.77m,
                FinalUnitPrice = 240.77m,
                LineTotal = 240.77m,
                Pricing = new PricingSnapshot { PriceSource = "catalog", OriginalUnitPrice = 240.77m },
                Delivery = new DeliverySnapshot { DeliveryType = "Key" }
            }
        }
    };

    [Fact]
    public void Order_with_attribution_maps_to_document()
    {
        var mapper = CreateMapper();
        var order = OrderWithEverythingFilled();

        var document = mapper.Map<OrderDb>(order);

        Assert.NotNull(document.Attribution);
        Assert.Equal("google", document.Attribution!.Source);
        Assert.Equal("organic", document.Attribution.Medium);
        Assert.Equal("summer", document.Attribution.Campaign);
        Assert.Equal("https://google.com/search", document.Attribution.Referrer);
        Assert.Equal("/games/portal-2", document.Attribution.LandingPath);
        Assert.Equal(order.Attribution!.FirstSeenUtc, document.Attribution.FirstSeenUtc);
    }

    [Fact]
    public void Document_maps_back_to_order_with_attribution()
    {
        var mapper = CreateMapper();
        var document = mapper.Map<OrderDb>(OrderWithEverythingFilled());

        var order = mapper.Map<Order>(document);

        Assert.NotNull(order.Attribution);
        Assert.Equal("google", order.Attribution!.Source);
        Assert.Equal("/games/portal-2", order.Attribution.LandingPath);
    }

    /// <summary>
    /// Заказ без меток перехода — обычный прямой заход. Пустое «первое касание» не должно
    /// ни падать, ни превращаться в пустой объект в базе.
    /// </summary>
    [Fact]
    public void Order_without_attribution_maps_to_null()
    {
        var mapper = CreateMapper();
        var order = OrderWithEverythingFilled();
        order.Attribution = null;

        var document = mapper.Map<OrderDb>(order);

        Assert.Null(document.Attribution);
    }
}
