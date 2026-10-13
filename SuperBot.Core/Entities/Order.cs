namespace SuperBot.Core.Entities
{
    public class Order
    {
        public Guid Id { get; set; }
        public string? OrderNumber { get; set; }
        public Guid OrderGuid { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string PaymentProvider { get; set; } = "stripe";
        public string? PaymentIntentId { get; set; }
        /// <summary>Способ оплаты по данным Stripe: card, paypal, link… Пусто у старых заказов.</summary>
        public string? PaidWithType { get; set; }
        /// <summary>Платёжная система карты (visa, mastercard…) — для «Visa •••• 4242» в заказе и письмах.</summary>
        public string? PaidWithBrand { get; set; }
        public string? PaidWithLast4 { get; set; }
        /// <summary>Кошелёк, если карта пришла через него: apple_pay, google_pay, link.</summary>
        public string? PaidWithWallet { get; set; }
        public string GameId { get; set; } = string.Empty;
        public string GameName { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public bool IsPaid { get; set; }
        /// <summary>Страна покупателя на момент оплаты (ISO alpha-2) — по ней выдаётся ключ нужного региона.</summary>
        public string? BuyerCountry { get; set; }
        /// <summary>Язык сайта у покупателя на момент оплаты (en/ru/uk/pl) — на нём уходят письма по заказу. null — неизвестен.</summary>
        public string? Language { get; set; }
        public bool IsFulfilled { get; set; }
        public DateTime OrderDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? PaidAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public int SnapshotVersion { get; set; } = 1;
        public string? Status { get; set; }
        public string? PaymentStatus { get; set; }
        public string? FulfillmentStatus { get; set; }
        public decimal? TotalAmount { get; set; }
        public decimal? SubtotalAmount { get; set; }
        public decimal? DiscountTotal { get; set; }
        public decimal? TaxTotal { get; set; }
        public string? PromoCode { get; set; }
        public decimal? PromoDiscountAmount { get; set; }

        /// <summary>
        /// Идентификатор посетителя в Google Analytics (значение из куки _ga), снятый в момент
        /// оформления. Нужен, чтобы серверная отправка покупки склеилась с тем же посетителем,
        /// который до этого ходил по сайту. Без него GA засчитает покупку как визит ниоткуда:
        /// выручка будет видна, а путь до неё — нет.
        /// Пусто, когда аналитика выключена или посетитель не дал согласия на куки.
        /// </summary>
        public string? AnalyticsClientId { get; set; }

        /// <summary>
        /// Когда покупатель подтвердил немедленную выдачу ключей и то, что вместе с ней
        /// теряет право отказаться от заказа. Цифровой товар выдаётся сразу, поэтому такое
        /// согласие должно быть явным и сохранённым — иначе доказать его нечем.
        /// </summary>
        public DateTime? DeliveryConsentAt { get; set; }

        /// <summary>Версия текста согласия — по ней видно, с чем именно согласились.</summary>
        public string? DeliveryConsentVersion { get; set; }

        /// <summary>Текст согласия на момент заказа: доказательством служит увиденное покупателем.</summary>
        public string? DeliveryConsentText { get; set; }

        /// <summary>
        /// Наш собственный идентификатор посетителя — тот же, которым помечены события воронки.
        /// Без него последний шаг воронки считается по заказам, а первые три по браузеру, и
        /// конверсию «начал оплату → заплатил» посчитать нечем: это разные наборы людей.
        /// </summary>
        public string? VisitorId { get; set; }

        /// <summary>
        /// Откуда пришёл покупатель — по первому касанию, а не по последнему.
        ///
        /// Последнее касание почти всегда «прямой заход» или поиск по названию магазина: человек
        /// уже знает, куда идёт. Деньги же приносит то, что привело его впервые, и именно это
        /// нужно сопоставлять с расходами на рекламу.
        ///
        /// Пусто у заказов, оформленных до появления атрибуции, и у тех, кто пришёл без меток.
        /// </summary>
        public OrderAttribution? Attribution { get; set; }

        /// <summary>
        /// Сколько денег возвращено покупателю, в валюте заказа. Накопительно: у полного
        /// возврата равно сумме заказа, у частичного — возвращённой части, а при втором
        /// частичном возврате поверх первого — их сумме.
        ///
        /// null означает «возврата не было». Раньше сумма существовала только текстом внутри
        /// события («Partial refund of 12.40 EUR»), и отчёты не могли её учесть: разбирать
        /// число из сообщения — это догадка, выданная за бухгалтерию. Поэтому частичные
        /// возвраты в отчёте за период считались штуками и не вычитались из выручки.
        /// </summary>
        public decimal? RefundedAmount { get; set; }

        /// <summary>
        /// Доля стоимости заказа, возвращённая по позициям (0–1). null — по позициям не возвращали. Нужна, потому что
        /// при оплате кэшбэком деньги на карте не отражают долю заказа: см. <see cref="OrderRefunds"/>.
        /// </summary>
        public decimal? RefundedShare { get; set; }

        /// <summary>
        /// Гостевая покупка: true, пока покупатель не подтвердил почту по ссылке из письма.
        /// Пока флаг взведён, выдача ключей (включая бэкфилл при пополнении пула) запрещена.
        /// </summary>
        public bool RequiresDeliveryVerification { get; set; }

        /// <summary>
        /// Заказ оформлен без входа в аккаунт. Не то же самое, что RequiresDeliveryVerification:
        /// гость с уже подтверждённой почтой ключи получает сразу, но гостем от этого не перестаёт.
        /// Кэшбэк гостевым заказам не начисляется. У старых заказов — false.
        /// </summary>
        public bool PlacedAsGuest { get; set; }

        /// <summary>
        /// Сколько заказа оплачено кэшбэком, в валюте заказа. Totals.Total и TotalAmount — уже без неё:
        /// это деньги, которые списаны картой, с них и считается кэшбэк за заказ.
        /// </summary>
        public decimal CashbackApplied { get; set; }
        /// <summary>То же в долларах — столько списано с баланса кэшбэка.</summary>
        public decimal CashbackUsd { get; set; }

        /// <summary>
        /// Налог по заказу из Stripe Tax. Цены каталога включают налог, поэтому покупатель платит столько же,
        /// а TaxTotal — это часть итога, а не надбавка к нему. null — заказ оформлен до подключения налога
        /// или оплачен не через Stripe.
        /// </summary>
        public OrderTax? Tax { get; set; }

        /// <summary>Спор по оплате (чарджбек) — последний по этому платежу. null — споров не было.</summary>
        public OrderDispute? Dispute { get; set; }
        public string? Currency { get; set; }
        public string? Notes { get; set; }
        public MoneyTotals Totals { get; set; } = new();
        public List<OrderEvent> Events { get; set; } = new();
        public List<OrderItemSnapshot> Items { get; set; } = new();
    }

    /// <summary>
    /// Первое касание: как посетитель нашёл магазин. Снимается браузером при первом заходе и
    /// хранится у него же до оформления — сервер этих данных иначе не увидит.
    /// </summary>
    public class OrderAttribution
    {
        /// <summary>utm_source или домен перехода: google, telegram, reddit.com. Пусто — прямой заход.</summary>
        public string? Source { get; set; }
        public string? Medium { get; set; }
        public string? Campaign { get; set; }
        /// <summary>Полный адрес перехода — на случай, когда меток нет, а разобраться надо.</summary>
        public string? Referrer { get; set; }
        /// <summary>Первая страница, на которую человек попал.</summary>
        public string? LandingPath { get; set; }
        public DateTime? FirstSeenUtc { get; set; }
    }

    /// <summary>
    /// Спор по оплате: покупатель оспорил платёж в банке. Банк сразу забирает деньги и ждёт доказательств от магазина до
    /// <see cref="EvidenceDueBy"/>; итог — выигран (деньги вернулись) или проигран (остались у покупателя).
    /// </summary>
    public class OrderDispute
    {
        public string Id { get; set; } = string.Empty;
        /// <summary>Статус Stripe: warning_needs_response, warning_under_review, warning_closed, needs_response, under_review, won, lost.</summary>
        public string Status { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public long AmountMinor { get; set; }
        public string Currency { get; set; } = "USD";
        /// <summary>До какого момента банк ждёт доказательств. Пропустить — проиграть автоматически.</summary>
        public DateTime? EvidenceDueBy { get; set; }
        /// <summary>Доказательства уже отправлены в Stripe.</summary>
        public bool HasEvidence { get; set; }
        public DateTime OpenedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        /// <summary>won | lost | warning_closed (запрос банка закрыт без списания); null — спор идёт.</summary>
        public string? Outcome { get; set; }
        /// <summary>Платёжный статус до спора — к нему заказ возвращается, если спор выигран.</summary>
        public string? PaymentStatusBefore { get; set; }
    }

    /// <summary>Как налог по заказу посчитан и записан в Stripe Tax.</summary>
    public class OrderTax
    {
        /// <summary><see cref="OrderTaxStatuses"/>.</summary>
        public string Status { get; set; } = OrderTaxStatuses.Pending;
        public string? CalculationId { get; set; }
        /// <summary>Налоговая транзакция Stripe: именно она попадает в отчёты для подачи деклараций.</summary>
        public string? TransactionId { get; set; }
        /// <summary>Откуда взято место покупателя: billing_address | card | ip | selected_country.</summary>
        public string? LocationSource { get; set; }
        public string? Country { get; set; }
        public string? State { get; set; }
        /// <summary>vat, gst, sales_tax… — как вернул Stripe.</summary>
        public string? TaxType { get; set; }
        public decimal? RatePercent { get; set; }
        /// <summary>Почему налог такой: standard_rated, not_collecting (нет регистрации в стране), reverse_charge…</summary>
        public string? TaxabilityReason { get; set; }
        /// <summary>С какой суммы (с налогом) записана транзакция, в минорных единицах — от неё считаются сторно.</summary>
        public long AmountTotalMinor { get; set; }
        /// <summary>Сколько из этой суммы уже сторнировано возвратами, в минорных единицах.</summary>
        public long ReversedMinor { get; set; }
        public string? LastError { get; set; }
        public DateTime? RecordedAt { get; set; }
    }

    public static class OrderTaxStatuses
    {
        /// <summary>Транзакция ещё не записана — сверка повторит.</summary>
        public const string Pending = "pending";
        /// <summary>Транзакция записана в Stripe Tax.</summary>
        public const string Recorded = "recorded";
        /// <summary>Налог выключен в настройках, записывать нечего.</summary>
        public const string Skipped = "skipped";
    }

    public class MoneyTotals
    {
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal TaxTotal { get; set; }
        public decimal Total { get; set; }
    }

    public class OrderEvent
    {
        public string Type { get; set; } = string.Empty;
        public string? Message { get; set; }
        /// <summary>Кто это сделал: почта специалиста для ручных действий, null — система (вебхук, воркер).</summary>
        public string? Actor { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class OrderItemSnapshot
    {
        public string ItemId { get; set; } = Guid.NewGuid().ToString("N");
        public string ProductType { get; set; } = "Game";
        public string? GameId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CoverUrl { get; set; }
        /// <summary>Издание, если у игры их несколько: код и название на момент покупки. Пусто — базовое.</summary>
        public string? EditionCode { get; set; }
        public string? EditionTitle { get; set; }
        /// <summary>
        /// Региональный вариант ключа, выбранный покупателем: его ключ и подпись на момент покупки.
        ///
        /// Хранится в заказе, потому что выдача обязана взять ключ именно из этой группы: покупатель
        /// заплатил за европейский ключ по европейской цене, и глобальный (который дороже) или
        /// чужой региональный ему выдавать нельзя. Пусто — вариант не выбирался (обычный заказ,
        /// в том числе все заказы, созданные до появления вариантов).
        /// </summary>
        public string? OfferKey { get; set; }
        public string? OfferTitle { get; set; }
        public string? Slug { get; set; }
        public string? Platform { get; set; }
        public string? Region { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal UnitDiscount { get; set; }
        public decimal FinalUnitPrice { get; set; }
        public decimal LineTotal { get; set; }
        /// <summary>Сколько штук позиции возвращено из админки (возврат по позиции).</summary>
        public int RefundedQuantity { get; set; }
        public PricingSnapshot Pricing { get; set; } = new();
        public DeliverySnapshot? Delivery { get; set; }
    }

    public class PricingSnapshot
    {
        public string PriceSource { get; set; } = "catalog";
        public string? PromoId { get; set; }
        public string? CouponCode { get; set; }
        public decimal? OriginalUnitPrice { get; set; }
        public decimal? DiscountPercent { get; set; }
    }

    public class DeliverySnapshot
    {
        public string DeliveryType { get; set; } = "Key";
        public List<DeliveredKey> Keys { get; set; } = new();
        public DateTime? DeliveredAt { get; set; }
    }

    public class DeliveredKey
    {
        public string? KeyMasked { get; set; }
        public DateTime? DeliveredAt { get; set; }
    }
}
