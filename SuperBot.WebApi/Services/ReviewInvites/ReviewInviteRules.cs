using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services.ReviewInvites;

/// <summary>
/// Решение «писать или нет» — без базы и без почты, только правила.
///
/// Вынесено отдельно намеренно: это единственное место, где мы решаем побеспокоить живого
/// человека, и проверять такое надо тестами, а не рассылкой по продовой базе. Порядок
/// проверок задан от «дешёвых и окончательных» к «дорогим»: отписку и повтор надо увидеть
/// раньше, чем считать, о каких играх писать.
/// </summary>
public static class ReviewInviteRules
{
    /// <summary>
    /// Когда по заказу выдали ключи. Берём самую позднюю выдачу: в заказе из трёх игр
    /// последняя могла уехать позже остальных (ключа не было в пуле), и отсчитывать неделю
    /// надо от неё, иначе про эту игру спросим раньше, чем человек её получил.
    /// </summary>
    public static DateTime? DeliveredAt(Order order)
    {
        if (order.Items is not { Count: > 0 })
        {
            return null;
        }

        DateTime? latest = null;
        foreach (var item in order.Items)
        {
            var delivery = item?.Delivery;
            if (delivery is null)
            {
                continue;
            }

            var candidates = new List<DateTime?> { delivery.DeliveredAt };
            if (delivery.Keys is { Count: > 0 })
            {
                candidates.AddRange(delivery.Keys.Select(key => key?.DeliveredAt));
            }

            foreach (var candidate in candidates)
            {
                if (candidate is { } value && (latest is null || value > latest))
                {
                    latest = value;
                }
            }
        }

        return latest;
    }

    public static ReviewInviteDecision Decide(
        Order order,
        DateTime nowUtc,
        ReviewInviteOptions options,
        bool alreadyInvited,
        bool optedOut,
        IReadOnlySet<string> reviewedGameIds)
    {
        if (alreadyInvited)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.AlreadyInvited);
        }

        if (optedOut)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.OptedOut);
        }

        if (!order.IsPaid)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.NotDelivered);
        }

        var delivered = DeliveredAt(order);
        if (delivered is null)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.NotDelivered);
        }

        var age = nowUtc - delivered.Value;
        if (age < TimeSpan.FromDays(Math.Max(0, options.DelayDays)))
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.TooEarly);
        }

        if (age > TimeSpan.FromDays(Math.Max(1, options.MaxAgeDays)))
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.TooOld);
        }

        // Адрес покупателя лежит в UserName: у гостевых заказов это прямо почта, у заказов
        // из аккаунта — тот же адрес, под которым человек вошёл. Всё, что не похоже на почту
        // (внутренние идентификаторы старых заказов), отсекаем — писать туда некуда.
        if (string.IsNullOrWhiteSpace(order.UserName) || !order.UserName.Contains('@'))
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.NoEmail);
        }

        // Вести можно только туда, где есть страница: без slug ссылки не построить.
        var reviewable = (order.Items ?? new List<OrderItemSnapshot>())
            .Where(item => !string.IsNullOrWhiteSpace(item?.GameId) && !string.IsNullOrWhiteSpace(item?.Slug))
            .Select(item => item!.GameId!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (reviewable.Count == 0)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.NothingToReview);
        }

        var pending = reviewable.Where(gameId => !reviewedGameIds.Contains(gameId)).ToList();
        if (pending.Count == 0)
        {
            return ReviewInviteDecision.Skipped(ReviewInviteSkip.AlreadyReviewed);
        }

        return ReviewInviteDecision.Send(pending);
    }
}
