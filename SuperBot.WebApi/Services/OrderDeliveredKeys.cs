using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Services;

/// <summary>Выданный ключ заказа: к какой позиции относится и что писать в письме.</summary>
public sealed record OrderDeliveredKey(string ItemId, DeliveredKeyNotification Key);

/// <summary>
/// Сопоставляет ключи покупателя со строками заказа. В заказе ключ хранится только маской
/// (последние четыре знака), полный лежит у пользователя в GameKeys — здесь они сводятся по игре
/// и хвосту. Общий код для «показать ключи» в кабинете и «переслать письмо» (кабинет и админка).
/// </summary>
public static class OrderDeliveredKeys
{
    public static List<OrderDeliveredKey> Resolve(Order order, IReadOnlyList<GameKey> userKeys)
    {
        var result = new List<OrderDeliveredKey>();
        var used = new HashSet<string>();

        foreach (var item in order.Items ?? new List<OrderItemSnapshot>())
        {
            foreach (var delivered in item.Delivery?.Keys ?? new List<DeliveredKey>())
            {
                var match = userKeys.FirstOrDefault(k =>
                    string.Equals(k.GameId, item.GameId, StringComparison.OrdinalIgnoreCase)
                    && !used.Contains(k.Key)
                    && MaskMatches(k.Key, delivered.KeyMasked));
                if (match is null)
                {
                    continue;
                }
                used.Add(match.Key);
                result.Add(new OrderDeliveredKey(
                    item.ItemId,
                    new DeliveredKeyNotification(
                        string.IsNullOrWhiteSpace(item.Title) ? order.GameName : item.Title,
                        match.Key, match.KeyType, item.ProductType, item.GameId, item.EditionCode)));
            }
        }
        return result;
    }

    public static bool MaskMatches(string plain, string? mask)
    {
        if (string.IsNullOrWhiteSpace(plain) || string.IsNullOrWhiteSpace(mask))
        {
            return false;
        }
        var trimmed = plain.Trim();
        if (trimmed.Length != mask.Length)
        {
            return false;
        }
        var tail = trimmed.Length <= 4 ? trimmed : trimmed[^4..];
        return mask.EndsWith(tail, StringComparison.Ordinal);
    }

    /// <summary>Адрес для подтверждения «письмо ушло на …», не раскрывая его целиком: a***@taleshop.test.</summary>
    public static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0)
        {
            return email;
        }
        var local = email[..at];
        var shown = local.Length <= 2 ? local[..1] : local[..2];
        return $"{shown}***{email[at..]}";
    }
}
