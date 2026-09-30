namespace SuperBot.Core.Cashback
{
    /// <summary>
    /// Запись журнала кэшбэка. Журнал — единственный источник правды: баланс ниоткуда не
    /// «хранится», он каждый раз пересчитывается из записей (<see cref="CashbackProjection"/>).
    /// Поэтому сбой между двумя записями в базу не может «потерять» или «нарисовать» деньги —
    /// в проекте нет транзакций Mongo, и держать отдельный счётчик баланса было бы рискованно.
    /// </summary>
    public class CashbackEntry
    {
        public string? Id { get; set; }

        /// <summary>Покупатель — тот же ключ, что у заказов (email, см. CurrentUserExtensions.GetUserKey).</summary>
        public string UserKey { get; set; } = string.Empty;

        /// <summary><see cref="CashbackEntryTypes"/>.</summary>
        public string Type { get; set; } = string.Empty;

        /// <summary>
        /// Сумма в долларах, всегда неотрицательная, кроме ручной правки: там знак — направление.
        /// Для reversal — сколько начисления забирается, для spend — сколько списано.
        /// </summary>
        public decimal AmountUsd { get; set; }

        /// <summary>Только у spend: <see cref="CashbackSpendStatuses"/>.</summary>
        public string? Status { get; set; }

        public string? OrderId { get; set; }
        public string? OrderNumber { get; set; }
        /// <summary>Название первой игры заказа — для истории в кабинете.</summary>
        public string? GameTitle { get; set; }
        /// <summary>Обложка первой игры заказа — для истории в кабинете.</summary>
        public string? GameCoverUrl { get; set; }

        /// <summary>
        /// У earn — сколько по заказу заплачено деньгами, в долларах: от этой суммы процент и из неё
        /// складывается сумма покупок для уровня. У reversal — какая часть этой суммы возвращена.
        /// </summary>
        public decimal? OrderTotalUsd { get; set; }

        /// <summary>Сумма и валюта заказа, как их видел покупатель, — для истории.</summary>
        public decimal? OrderTotal { get; set; }
        public string? OrderCurrency { get; set; }

        /// <summary>Процент уровня на момент заказа.</summary>
        public decimal? Percent { get; set; }

        public DateTime CreatedAt { get; set; }

        /// <summary>У earn — когда станет доступно.</summary>
        public DateTime? UnlocksAt { get; set; }

        /// <summary>У пополняющих записей (earn, return, adjust с плюсом) — когда сгорит остаток. Пусто — не сгорает.</summary>
        public DateTime? ExpiresAt { get; set; }

        /// <summary>
        /// Ключ идемпотентности: повтор события (вебхук, confirm) с тем же ключом новую запись не создаёт.
        /// </summary>
        public string IdempotencyKey { get; set; } = string.Empty;

        /// <summary>У spend — платёж, под который списано (PaymentIntent).</summary>
        public string? Reference { get; set; }

        public string? Note { get; set; }
        public string? Actor { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public static class CashbackEntryTypes
    {
        /// <summary>Начисление за оплаченный заказ.</summary>
        public const string Earn = "earn";
        /// <summary>Заказ возвращён — забираем начисленное за него (целиком или частью).</summary>
        public const string Reversal = "reversal";
        /// <summary>Оплата кэшбэком.</summary>
        public const string Spend = "spend";
        /// <summary>Заказ, оплаченный кэшбэком, возвращён — потраченное возвращается на баланс.</summary>
        public const string Return = "return";
        /// <summary>Ручная правка из админки, с причиной.</summary>
        public const string Adjust = "adjust";
    }

    public static class CashbackSpendStatuses
    {
        /// <summary>Отложено под неоплаченный ещё платёж: тратить второй раз нельзя.</summary>
        public const string Reserved = "reserved";
        /// <summary>Платёж прошёл — списано окончательно.</summary>
        public const string Committed = "committed";
        /// <summary>Платёж не состоялся — резерв снят, как будто его не было.</summary>
        public const string Released = "released";
    }
}
