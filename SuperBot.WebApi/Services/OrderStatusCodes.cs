using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services;

/// <summary>Код статуса заказа для кабинета и админки: явный статус, иначе выводится из оплаты и выдачи.</summary>
public static class OrderStatusCodes
{
    public static string Resolve(Order order)
    {
        if (!string.IsNullOrWhiteSpace(order.Status))
        {
            return order.Status.ToUpperInvariant();
        }
        if (!order.IsPaid)
        {
            return "PENDING";
        }
        return order.IsFulfilled ? "DELIVERED" : "PROCESSING";
    }
}
