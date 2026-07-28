using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces
{
    /// <summary>
    /// Чек-мета для письма с ключами: дата покупки, сумма, способ оплаты. Показывается
    /// строкой под заголовком, чтобы письмо читалось как настоящая квитанция, а не промо.
    /// </summary>
    public sealed record KeyDeliveryReceipt(DateTime PurchasedAt, decimal? Amount, string? Currency, string PaymentMethod)
    {
        public static KeyDeliveryReceipt FromOrder(Order order) => new(
            order.PaidAt ?? (order.OrderDate == default ? order.CreatedAt : order.OrderDate),
            order.TotalAmount,
            order.Currency,
            MapMethod(order.PaymentProvider));

        private static string MapMethod(string? provider) => provider?.ToLowerInvariant() switch
        {
            "btcpay" => "Crypto",
            "stars" => "Telegram Stars",
            _ => "Card"
        };
    }

    /// <summary>Одна позиция, по которой ещё ждут ключи: название игры и сколько осталось выдать.</summary>
    public sealed record KeyDeliveryPendingLine(string Title, int Remaining);

    /// <summary>
    /// Прогресс выдачи по заказу: всего ключей нужно, сколько уже выдано, что ещё в пути.
    /// Нужен, чтобы письмо честно писало «часть заказа готова», а не «заказ завершён», когда пришла не вся выдача.
    /// </summary>
    public sealed record KeyDeliveryProgress(int TotalKeys, int DeliveredKeys, IReadOnlyList<KeyDeliveryPendingLine> Pending)
    {
        public bool IsComplete => DeliveredKeys >= TotalKeys;

        public static KeyDeliveryProgress FromOrder(Order order)
        {
            var total = 0;
            var delivered = 0;
            var pending = new List<KeyDeliveryPendingLine>();

            foreach (var item in order.Items)
            {
                var needed = Math.Max(1, item.Quantity > 0 ? item.Quantity : item.Qty);
                var got = item.Delivery?.Keys.Count ?? 0;
                total += needed;
                delivered += Math.Min(got, needed);

                var remaining = needed - got;
                if (remaining > 0)
                {
                    var title = !string.IsNullOrWhiteSpace(item.Title) ? item.Title
                        : (!string.IsNullOrWhiteSpace(item.TitleSnapshot) ? item.TitleSnapshot : "Game");
                    pending.Add(new KeyDeliveryPendingLine(title, remaining));
                }
            }

            return new KeyDeliveryProgress(total, delivered, pending);
        }
    }

    /// <summary>
    /// Письма, связанные с выдачей ключей. Интерфейс живёт в Core, потому что его дёргает
    /// финализация заказа (Infrastructure), а SMTP-реализация — в WebApi (там вся почта).
    /// </summary>
    public interface IDeliveryMailer
    {
        /// <summary>
        /// Гостевая покупка: ключи придержаны, просим подтвердить почту.
        /// Ссылка ведёт на /api/payments/verify-delivery?token=…
        /// </summary>
        Task SendKeyDeliveryVerificationAsync(string email, string orderNumber, string verifyUrl, CancellationToken cancellationToken = default);

        /// <summary>
        /// Отправляет покупателю выданные в этом заходе ключи. receipt — чек-строка (опц.);
        /// progress — прогресс по заказу (опц.): если выдана лишь часть, письмо так и напишет + перечислит ожидаемое.
        /// </summary>
        Task SendGameKeysAsync(string email, string orderNumber, IReadOnlyList<DeliveredKeyNotification> keys, KeyDeliveryReceipt? receipt = null, KeyDeliveryProgress? progress = null, CancellationToken cancellationToken = default);

        /// <summary>Почта не подтверждена за отведённый срок — заказ автоматически возвращён.</summary>
        Task SendAutoRefundNoticeAsync(string email, string orderNumber, CancellationToken cancellationToken = default);
    }
}
