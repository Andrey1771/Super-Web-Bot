using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Services.Analytics
{
    /// <summary>
    /// Покупка в GA4 через Measurement Protocol — HTTP-запрос с сервера, без участия браузера.
    ///
    /// Требует двух вещей из настроек аналитики: Measurement ID (тот же, что у витрины) и
    /// Measurement Protocol API secret. Пока секрета нет, отправка молча не делается: включать
    /// её самостоятельно нельзя, а падать из-за ненастроенного счётчика — тем более.
    /// </summary>
    public class Ga4PurchaseAnalytics : IPurchaseAnalytics
    {
        private const string Endpoint = "https://www.google-analytics.com/mp/collect";

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IAnalyticsSettingsRepository _settings;
        private readonly ILogger<Ga4PurchaseAnalytics> _logger;

        public Ga4PurchaseAnalytics(
            IHttpClientFactory httpClientFactory,
            IAnalyticsSettingsRepository settings,
            ILogger<Ga4PurchaseAnalytics> logger)
        {
            _httpClientFactory = httpClientFactory;
            _settings = settings;
            _logger = logger;
        }

        public Task TrackPurchaseAsync(Order order, CancellationToken cancellationToken = default) =>
            SendAsync(order, BuildPurchasePayload, "purchase", cancellationToken);

        public Task TrackRefundAsync(Order order, decimal refundedAmount, bool isFullRefund, CancellationToken cancellationToken = default) =>
            SendAsync(order, o => BuildRefundPayload(o, refundedAmount, isFullRefund), "refund", cancellationToken);

        /// <summary>
        /// Общая отправка: покупка и возврат отличаются только телом события, а всё остальное —
        /// проверка настроек, тайм-аут и глушение ошибок — у них одинаковое.
        /// </summary>
        private async Task SendAsync(
            Order order,
            Func<Order, object> buildPayload,
            string eventName,
            CancellationToken cancellationToken)
        {
            try
            {
                if (order is null)
                {
                    return;
                }

                var settings = await _settings.GetAsync();
                if (settings is null
                    || !settings.IsEnabled
                    || string.IsNullOrWhiteSpace(settings.GaMeasurementId)
                    || string.IsNullOrWhiteSpace(settings.GaApiSecret))
                {
                    return;
                }

                var payload = buildPayload(order);
                var url = $"{Endpoint}?measurement_id={Uri.EscapeDataString(settings.GaMeasurementId)}&api_secret={Uri.EscapeDataString(settings.GaApiSecret)}";

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content, cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    // GA отвечает 2xx почти всегда, даже на кривой payload, поэтому сюда попадаем
                    // редко — но если попали, знать об этом полезнее, чем молчать.
                    _logger.LogWarning(
                        "GA4 {Event} for order {OrderNumber} rejected: {Status}",
                        eventName,
                        order.OrderNumber,
                        (int)response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                // Ни одна ошибка счётчика не должна касаться заказа: деньги получены, ключи выданы.
                _logger.LogWarning(ex, "GA4 {Event} for order {OrderNumber} failed to send.", eventName, order?.OrderNumber);
            }
        }

        /// <summary>
        /// Возврат. Полный посылается одним номером заказа — аналитика вычтет его целиком со
        /// всеми позициями. У частичного номера мало: без суммы вычтется весь заказ, поэтому
        /// сумма передаётся явно, а список позиций не передаётся вовсе — какие именно позиции
        /// вернули, платёжная система не сообщает, и придумывать это нельзя.
        /// </summary>
        private static object BuildRefundPayload(Order order, decimal refundedAmount, bool isFullRefund)
        {
            var currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency;

            object parameters = isFullRefund
                ? new { transaction_id = order.OrderNumber, currency }
                : new { transaction_id = order.OrderNumber, currency, value = refundedAmount };

            return new
            {
                client_id = string.IsNullOrWhiteSpace(order.AnalyticsClientId)
                    ? $"srv.{order.OrderNumber}"
                    : order.AnalyticsClientId,
                non_personalized_ads = true,
                events = new[]
                {
                    new { name = "refund", @params = parameters }
                }
            };
        }

        /// <summary>
        /// Вариант товара для GA: издание и регион ключа одной строкой.
        ///
        /// Собирается ровно так же, как на витрине (add_to_cart, view_cart): иначе в отчётах
        /// один и тот же товар назывался бы по-разному на разных шагах воронки, и сравнить
        /// «сколько положили» со «сколько купили» стало бы нельзя. Названия, а не коды, —
        /// отчёты читают люди.
        /// </summary>
        private static string? ItemVariant(OrderItemSnapshot item)
        {
            var parts = new[]
            {
                string.IsNullOrWhiteSpace(item.EditionTitle) ? item.EditionCode : item.EditionTitle,
                item.OfferTitle
            }.Where(part => !string.IsNullOrWhiteSpace(part));

            var variant = string.Join(" · ", parts);
            return string.IsNullOrWhiteSpace(variant) ? null : variant;
        }

        private static object BuildPurchasePayload(Order order)
        {
            var items = (order.Items ?? new List<OrderItemSnapshot>())
                .Select(item => new
                {
                    item_id = item.GameId ?? string.Empty,
                    item_name = item.Title ?? string.Empty,
                    item_variant = ItemVariant(item),
                    price = item.FinalUnitPrice,
                    quantity = item.Quantity
                })
                .ToArray();

            var total = order.Totals?.Total is > 0 ? order.Totals.Total : order.TotalAmount ?? 0m;

            return new
            {
                // Без client_id GA считает покупку визитом ниоткуда. Когда его нет (аналитика
                // выключена, согласия не было), подставляем стабильный идентификатор от номера
                // заказа: выручка тогда учтётся, а путь до неё — нет. Это честнее, чем потерять
                // покупку совсем, и заметно по отсутствию источника трафика.
                client_id = string.IsNullOrWhiteSpace(order.AnalyticsClientId)
                    ? $"srv.{order.OrderNumber}"
                    : order.AnalyticsClientId,
                // Время события: GA принимает задним числом до 72 часов. Вебхук может прийти
                // с задержкой, и покупка должна лечь в тот день, когда её оплатили.
                timestamp_micros = ToMicros(order.PaidAt ?? order.OrderDate),
                non_personalized_ads = true,
                events = new[]
                {
                    new
                    {
                        name = "purchase",
                        @params = new
                        {
                            transaction_id = order.OrderNumber,
                            value = total,
                            currency = string.IsNullOrWhiteSpace(order.Currency) ? "USD" : order.Currency,
                            coupon = string.IsNullOrWhiteSpace(order.PromoCode) ? null : order.PromoCode,
                            items
                        }
                    }
                }
            };
        }

        private static long ToMicros(DateTime at)
        {
            var utc = at.Kind == DateTimeKind.Utc ? at : at.ToUniversalTime();
            return (long)(utc - DateTime.UnixEpoch).TotalMilliseconds * 1000L;
        }
    }
}
