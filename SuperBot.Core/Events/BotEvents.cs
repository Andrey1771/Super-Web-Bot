using SuperBot.Core.Interfaces;

namespace SuperBot.Core.Events
{
    /// <summary>Ключи выданы по заказу — доставить в Telegram-чат покупателя (если привязан).</summary>
    public record KeysDeliveredEvent(IReadOnlyList<string> UserAliases, IReadOnlyList<DeliveredKeyNotification> Keys);

    /// <summary>Активирована скидка на игру — разослать алерты тем, у кого она в wishlist.</summary>
    public record GameDiscountActivatedEvent(string GameId);

    /// <summary>ИИ-чат эскалирован на человека — отправить готовый текст специалисту в Telegram.</summary>
    public record SupportEscalationEvent(string Text);
}
