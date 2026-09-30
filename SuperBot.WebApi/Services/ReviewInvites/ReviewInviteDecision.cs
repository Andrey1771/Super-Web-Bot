namespace SuperBot.WebApi.Services.ReviewInvites;

/// <summary>Почему по заказу не написали. Причина нужна не для логов, а для админки и тестов.</summary>
public enum ReviewInviteSkip
{
    None = 0,
    /// <summary>Заказ не оплачен или ключи ещё не выданы.</summary>
    NotDelivered,
    /// <summary>С выдачи прошло меньше <see cref="ReviewInviteOptions.DelayDays"/> дней.</summary>
    TooEarly,
    /// <summary>Заказ старше <see cref="ReviewInviteOptions.MaxAgeDays"/> — поезд ушёл.</summary>
    TooOld,
    /// <summary>Адрес неизвестен: писать некуда.</summary>
    NoEmail,
    /// <summary>Человек отказался от таких писем или отписан от рассылки вообще.</summary>
    OptedOut,
    /// <summary>По этому заказу уже приглашали.</summary>
    AlreadyInvited,
    /// <summary>Обо всех играх заказа человек уже высказался.</summary>
    AlreadyReviewed,
    /// <summary>В заказе нет ни одной позиции, на которую можно вести (нет slug).</summary>
    NothingToReview,
}

/// <summary>Что делать с конкретным заказом: писать и о чём, либо не писать и почему.</summary>
public sealed record ReviewInviteDecision(ReviewInviteSkip Skip, IReadOnlyList<string> GameIds)
{
    public bool ShouldSend => Skip == ReviewInviteSkip.None && GameIds.Count > 0;

    public static ReviewInviteDecision Skipped(ReviewInviteSkip reason) =>
        new(reason, Array.Empty<string>());

    public static ReviewInviteDecision Send(IReadOnlyList<string> gameIds) =>
        new(ReviewInviteSkip.None, gameIds);
}
