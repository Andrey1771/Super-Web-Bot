using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Stripe;
using SuperBot.Infrastructure.Models;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Серверная финализация Stripe-платежа.
    /// Подпись проверяется секретом Stripe:WebhookSecret; авторизация — не Keycloak, а подпись.
    /// </summary>
    [ApiController]
    [Route("api/payments")]
    [AllowAnonymous]
    public class StripeWebhookController : ControllerBase
    {
        private readonly IOrderFinalizationService _finalization;
        private readonly IPaymentReconciliationService _reconciliation;
        private readonly IStripeEventLog _eventLog;
        private readonly StripeSettings _stripeSettings;
        private readonly ILogger<StripeWebhookController> _logger;

        public StripeWebhookController(
            IOrderFinalizationService finalization,
            IPaymentReconciliationService reconciliation,
            IStripeEventLog eventLog,
            IOptions<StripeSettings> stripeSettings,
            ILogger<StripeWebhookController> logger)
        {
            _finalization = finalization;
            _reconciliation = reconciliation;
            _eventLog = eventLog;
            _stripeSettings = stripeSettings.Value;
            _logger = logger;
        }

        [HttpPost("webhook")]
        public async Task<IActionResult> Handle()
        {
            var webhookSecret = _stripeSettings.WebhookSecret;
            if (string.IsNullOrWhiteSpace(webhookSecret))
            {
                _logger.LogError("Stripe webhook hit but Stripe:WebhookSecret is not configured — cannot verify signature.");
                // 500 → Stripe пометит доставку неуспешной и попробует ещё раз, когда секрет настроят.
                return StatusCode(StatusCodes.Status500InternalServerError, "Webhook secret not configured.");
            }

            var payload = await new StreamReader(Request.Body).ReadToEndAsync();
            var signature = Request.Headers["Stripe-Signature"].FirstOrDefault();

            Event stripeEvent;
            try
            {
                stripeEvent = EventUtility.ConstructEvent(payload, signature, webhookSecret);
            }
            catch (Exception ex)
            {
                // Эндпоинт публичный и принимает недоверенный ввод: на любой мусор он обязан
                // отвечать 400, а не падать пятисоткой. Кроме StripeException тут вылетают и
                // ошибки разбора JSON (вплоть до NullReferenceException внутри парсера SDK).
                _logger.LogWarning(ex, "Stripe webhook rejected: bad signature or unparsable payload ({Message}).", ex.Message);
                return BadRequest("Invalid payload or signature.");
            }

            // Stripe доставляет события «хотя бы один раз» — повтор уже обработанного пропускаем.
            if (await _eventLog.IsProcessedAsync(stripeEvent.Id))
            {
                _logger.LogInformation("Stripe event {EventId} ({Type}) already processed — skipping.", stripeEvent.Id, stripeEvent.Type);
                return Ok();
            }

            var handled = await HandleEventAsync(stripeEvent);

            // Помечаем ТОЛЬКО успешно обработанное: иначе неудача «съела» бы событие,
            // и Stripe уже не смог бы его повторить.
            if (handled.Success)
            {
                await _eventLog.MarkProcessedAsync(stripeEvent.Id, stripeEvent.Type);
            }

            return handled.Response;
        }

        private async Task<(bool Success, IActionResult Response)> HandleEventAsync(Event stripeEvent)
        {
            // Возврат денег: заказ обязан перестать считаться оплаченным.
            if (stripeEvent.Type == "charge.refunded")
            {
                if (stripeEvent.Data.Object is not Charge charge || string.IsNullOrWhiteSpace(charge.PaymentIntentId))
                {
                    _logger.LogWarning("charge.refunded without a usable Charge payload ({EventId}).", stripeEvent.Id);
                    return (true, Ok());
                }

                var applied = await _reconciliation.ApplyRefundAsync(new RefundNotice
                {
                    PaymentIntentId = charge.PaymentIntentId,
                    AmountRefundedMinor = charge.AmountRefunded,
                    ChargeAmountMinor = charge.Amount,
                    Currency = charge.Currency ?? "usd",
                    EventId = stripeEvent.Id
                });

                // Не применилось (заказ ещё не создан) → просим Stripe повторить.
                return applied
                    ? (true, Ok())
                    : (false, StatusCode(StatusCodes.Status500InternalServerError, "Refund not applied yet."));
            }

            // Чарджбек: деньги оспорены, а ключ уже у покупателя — это всегда к человеку.
            if (stripeEvent.Type == "charge.dispute.created")
            {
                if (stripeEvent.Data.Object is not Dispute dispute || string.IsNullOrWhiteSpace(dispute.PaymentIntentId))
                {
                    _logger.LogWarning("charge.dispute.created without a usable Dispute payload ({EventId}).", stripeEvent.Id);
                    return (true, Ok());
                }

                var applied = await _reconciliation.ApplyDisputeAsync(new DisputeNotice
                {
                    PaymentIntentId = dispute.PaymentIntentId,
                    DisputeId = dispute.Id,
                    Reason = dispute.Reason,
                    AmountMinor = dispute.Amount,
                    Currency = dispute.Currency ?? "usd",
                    EventId = stripeEvent.Id
                });

                return applied
                    ? (true, Ok())
                    : (false, StatusCode(StatusCodes.Status500InternalServerError, "Dispute not applied yet."));
            }

            if (stripeEvent.Type == "payment_intent.succeeded")
            {
                if (stripeEvent.Data.Object is not PaymentIntent paymentIntent)
                {
                    _logger.LogWarning("payment_intent.succeeded without a PaymentIntent payload ({EventId}).", stripeEvent.Id);
                    return (true, Ok());
                }

                var result = await _finalization.FinalizeAsync(new OrderFinalizationRequest
                {
                    PaymentIntentId = paymentIntent.Id,
                    ExpectedUserId = null, // владельца берём из metadata PI внутри сервиса
                    TraceId = stripeEvent.Id,
                    Source = "webhook",
                    // Ретраи Stripe ограничены самим Stripe — наш клиентский лимит их не касается.
                    EnforceAttemptLimit = false
                });

                // ПРАВИЛО: 2xx означает РОВНО ОДНО — заказ существует.
                // Любой другой исход = заказа нет, значит Stripe обязан прийти ещё раз.
                // Раньше 500 отдавался только на Failed, а Processing/AttemptsExceeded уходили
                // с 200 — Stripe считал доставку успешной и заказ терялся навсегда.
                var finalized = result.Outcome is FinalizationOutcome.Confirmed or FinalizationOutcome.AlreadyConfirmed;
                if (!finalized)
                {
                    _logger.LogError(
                        "Webhook did NOT finalize {PaymentIntentId}: {Outcome} ({Code} {Message}). Asking Stripe to retry.",
                        paymentIntent.Id, result.Outcome, result.ErrorCode, result.ErrorMessage);

                    // Идемпотентность гарантирует, что повтор не создаст дубль заказа.
                    return (false, StatusCode(StatusCodes.Status500InternalServerError, $"Not finalized: {result.Outcome}."));
                }

                _logger.LogInformation("Webhook finalized {PaymentIntentId}: {Outcome} (order {OrderId}).",
                    paymentIntent.Id, result.Outcome, result.OrderId);
            }

            // Остальные типы событий подтверждаем 200, чтобы Stripe не считал их неуспешными.
            return (true, Ok());
        }
    }
}
