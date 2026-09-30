namespace SuperBot.Core.Cashback
{
    /// <summary>
    /// Журнал кэшбэка: все изменения баланса проходят только через него.
    /// Все суммы — в долларах; пересчёт в валюту заказа делает вызывающий.
    /// </summary>
    public interface ICashbackLedger
    {
        /// <summary>Баланс на сейчас (или на заданный момент).</summary>
        Task<CashbackSummary> GetSummaryAsync(string userKey, DateTime? now = null);

        /// <summary>Записи журнала покупателя, новые сверху.</summary>
        Task<IReadOnlyList<CashbackEntry>> GetEntriesAsync(string userKey);

        /// <summary>
        /// Начисление за оплаченный заказ с выданными ключами. Процент — по уровню на момент заказа.
        /// Идемпотентно по заказу. null — начислять нечего (программа выключена, заказ до запуска, ноль).
        /// </summary>
        Task<CashbackEntry?> EarnAsync(CashbackEarnRequest request);

        /// <summary>
        /// Откладывает кэшбэк под платёж: не больше доступного. Повторный вызов с тем же платежом
        /// меняет сумму резерва (корзина изменилась), а не добавляет второй. Возвращает, сколько отложено.
        /// </summary>
        Task<decimal> ReserveAsync(string userKey, string reference, decimal requestedUsd);

        /// <summary>Платёж прошёл: резерв становится списанием по заказу. false — резерва нет или он уже закрыт.</summary>
        Task<bool> CommitAsync(string reference, string orderId, string? orderNumber);

        /// <summary>Платёж не состоялся: резерв снимается. false — резерва нет или он уже закрыт.</summary>
        Task<bool> ReleaseAsync(string reference);

        /// <summary>
        /// Переносит открытый резерв на другой платёж. Нужен оформлению: сумму к оплате надо знать до
        /// создания PaymentIntent, поэтому резерв ставится под временную ссылку и переносится на
        /// идентификатор намерения, когда тот появится.
        /// </summary>
        Task<bool> RebindReservationAsync(string fromReference, string toReference);

        /// <summary>Открытые резервы, не менявшиеся с <paramref name="updatedBefore"/>, — кандидаты на снятие.</summary>
        Task<IReadOnlyList<CashbackEntry>> GetStaleReservationsAsync(DateTime updatedBefore);

        /// <summary>
        /// Заказ возвращён на долю <paramref name="refundedFraction"/> (накопительно, 0…1): забирает эту долю
        /// начисленного и возвращает эту долю потраченного на заказ. Повтор с той же долей ничего не меняет.
        /// <paramref name="returnSpent"/> = false — только забрать (спор по оплате: деньги ещё не вернули).
        /// </summary>
        Task<CashbackReversalResult> ReverseOrderAsync(string userKey, string orderId, decimal refundedFraction, bool returnSpent = true);

        /// <summary>
        /// Отменяет всё забранное с начисления за заказ (спор по оплате выигран: деньги вернулись магазину).
        /// Потраченное на заказ не трогает — его и не возвращали. Повтор ничего не меняет. Возвращает, сколько восстановлено.
        /// </summary>
        Task<decimal> RestoreOrderAsync(string userKey, string orderId, string note);

        /// <summary>Ручная правка: плюс — пополнение, минус — списание (не ниже нуля). Причина обязательна.</summary>
        Task<CashbackEntry> AdjustAsync(string userKey, decimal amountUsd, string note, string actor);
    }

    public class CashbackEarnRequest
    {
        public string UserKey { get; set; } = string.Empty;
        public string OrderId { get; set; } = string.Empty;
        public string? OrderNumber { get; set; }
        public string? GameTitle { get; set; }
        public string? GameCoverUrl { get; set; }
        /// <summary>Сколько заплачено деньгами, в долларах, — без части, оплаченной кэшбэком.</summary>
        public decimal PaidUsd { get; set; }
        public decimal? OrderTotal { get; set; }
        public string? OrderCurrency { get; set; }
        /// <summary>Когда заказ оплачен — по этой дате проверяется запуск программы и считается уровень.</summary>
        public DateTime OrderedAt { get; set; }
    }

    public class CashbackReversalResult
    {
        public decimal ReversedUsd { get; set; }
        public decimal ReturnedUsd { get; set; }
    }
}
