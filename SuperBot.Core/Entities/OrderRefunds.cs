namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Какая часть заказа возвращена — одно правило для кэшбэка и налога.
    ///
    /// Раньше доля считалась только по деньгам: возвращённое на карту к списанному с карты. Пока заказ оплачивался
    /// картой целиком, это и была доля заказа. С оплатой кэшбэком это перестало работать: заказ на $247.77 мог стоить
    /// карте $1.00, и возврат одной игры за $49.99 — это $0.20 на карту, а такой округлённый цент сдвигал долю на
    /// проценты и терял доллары кэшбэка. Поэтому возврат по позициям записывает точную долю стоимости заказа
    /// (<see cref="Order.RefundedShare"/>), а доля по деньгам остаётся для возвратов из кабинета Stripe и споров.
    /// </summary>
    public static class OrderRefunds
    {
        public const string StatusRefunded = "REFUNDED";

        /// <summary>
        /// Доля от 0 до 1: полный возврат — 1; иначе большая из доли по деньгам и доли по позициям.
        /// Доля по деньгам — возвращённое на карту к ПОЛНОЙ стоимости заказа (карта плюс кэшбэк), а не к списанному
        /// картой: заказ на $247.77, оплаченный картой на $1.00, после возврата $0.50 из кабинета Stripe возвращён на
        /// 0.2%, а не наполовину — иначе кэшбэк и налог сторнировались бы на половину заказа.
        /// </summary>
        public static decimal Fraction(Order order)
        {
            if (string.Equals(order.Status, StatusRefunded, StringComparison.OrdinalIgnoreCase)
                || string.Equals(order.PaymentStatus, StatusRefunded, StringComparison.OrdinalIgnoreCase))
            {
                return 1m;
            }

            var byMoney = 0m;
            var value = OrderValue(order);
            if (value > 0 && order.RefundedAmount is > 0)
            {
                byMoney = order.RefundedAmount.Value / value;
            }

            return Math.Clamp(Math.Max(byMoney, order.RefundedShare ?? 0m), 0m, 1m);
        }

        /// <summary>Полная стоимость заказа для покупателя: списано картой плюс оплачено кэшбэком.</summary>
        public static decimal OrderValue(Order order) => CardTotal(order) + Math.Max(0m, order.CashbackApplied);

        /// <summary>Списано картой (без части, оплаченной кэшбэком). У старых заказов Totals пуст — берём TotalAmount.</summary>
        public static decimal CardTotal(Order order) =>
            order.Totals?.Total is > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;

        /// <summary>Стоимость заказа по позициям — от неё считается доля возвращённой позиции.</summary>
        public static decimal ItemsValue(Order order) =>
            (order.Items ?? new List<OrderItemSnapshot>()).Sum(item => item.LineTotal > 0 ? item.LineTotal : 0m);

        /// <summary>Сколько штук позиции ещё можно вернуть.</summary>
        public static int Refundable(OrderItemSnapshot item) => Math.Max(0, item.Quantity - item.RefundedQuantity);

        /// <summary>
        /// План возврата части позиции: новая доля заказа и сколько вернуть на карту сейчас.
        ///
        /// Сумма на карту — от накопленной доли, а не от доли этой позиции: <c>карта × доля − уже возвращено</c>, округлённое
        /// вниз до минорной единицы. Так округления не накапливаются, карта не опустошается раньше последней позиции, а
        /// когда возвращены все позиции, на карту уходит ровно остаток. Сумма может быть нулевой (заказ почти целиком
        /// оплачен кэшбэком, позиция дешёвая) — тогда Stripe не вызывается, а кэшбэк всё равно возвращается по доле.
        /// </summary>
        public static ItemRefundPlan? Plan(Order order, OrderItemSnapshot item, int quantity, Func<decimal, decimal> floorToMinor)
        {
            var value = ItemsValue(order);
            if (value <= 0 || item.Quantity <= 0 || quantity <= 0 || quantity > Refundable(item))
            {
                return null;
            }

            var lineValue = item.LineTotal * quantity / item.Quantity;
            var allRefunded = (order.Items ?? new List<OrderItemSnapshot>())
                .All(other => ReferenceEquals(other, item)
                    ? other.RefundedQuantity + quantity >= other.Quantity
                    : other.RefundedQuantity >= other.Quantity || other.Quantity <= 0);
            var share = allRefunded ? 1m : Math.Min(1m, (order.RefundedShare ?? 0m) + lineValue / value);

            var card = CardTotal(order);
            var already = order.RefundedAmount ?? 0m;
            var target = allRefunded ? card : floorToMinor(card * share);
            var toCard = Math.Clamp(target - already, 0m, Math.Max(0m, card - already));

            return new ItemRefundPlan(lineValue, share, toCard, allRefunded);
        }
    }

    /// <summary>Возврат части позиции: её стоимость, новая доля заказа, сумма на карту и возвращён ли теперь весь заказ.</summary>
    public sealed record ItemRefundPlan(decimal LineValue, decimal Share, decimal ToCard, bool AllItemsRefunded);
}
