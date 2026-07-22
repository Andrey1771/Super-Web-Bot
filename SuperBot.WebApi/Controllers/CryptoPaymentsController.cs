using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Крипто-оплата (DEMO): BTCPay Server Greenfield, testnet. Реальные средства не принимаются —
    /// это демонстрация альтернативного платёжного провайдера. Выключено, пока BtcPay:* не настроен.
    /// </summary>
    [ApiController]
    [Route("api/payments/crypto")]
    public class CryptoPaymentsController : ControllerBase
    {
        private readonly BtcPayOptions _options;
        private readonly BtcPayClient _btcPay;
        private readonly IOrderRepository _orderRepository;
        private readonly IKeyFulfillmentService _keyFulfillmentService;
        private readonly ICheckoutPricingService _pricing;
        private readonly IMongoCollection<CryptoInvoiceStateDb> _invoiceStates;
        private readonly ILogger<CryptoPaymentsController> _logger;

        public CryptoPaymentsController(
            IOptions<BtcPayOptions> options,
            BtcPayClient btcPay,
            IOrderRepository orderRepository,
            IKeyFulfillmentService keyFulfillmentService,
            ICheckoutPricingService pricing,
            IMongoDatabase database,
            ILogger<CryptoPaymentsController> logger)
        {
            _options = options.Value;
            _btcPay = btcPay;
            _orderRepository = orderRepository;
            _keyFulfillmentService = keyFulfillmentService;
            _pricing = pricing;
            _invoiceStates = database.GetCollection<CryptoInvoiceStateDb>("CryptoInvoiceStates");
            _logger = logger;
        }

        /// <summary>Фронт по этому флагу решает, показывать ли крипто-опцию на checkout.</summary>
        [HttpGet("config")]
        public IActionResult GetConfig() => Ok(new { enabled = _options.IsConfigured, demo = true });

        [Authorize]
        [HttpPost("invoice")]
        public async Task<IActionResult> CreateInvoice([FromBody] CryptoInvoiceRequest request, CancellationToken ct)
        {
            if (!_options.IsConfigured)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Crypto payments are not configured.");
            }

            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            // Как и в Stripe-чекауте: из запроса берём только gameId + quantity.
            // Сумму считает сервер по каталогу — клиентским ценам доверять нельзя.
            var pricing = await _pricing.PriceAsync(new CheckoutPricingRequest
            {
                Items = (request?.Items ?? new List<CryptoInvoiceItemRequest>())
                    .Select(item => new CheckoutPricingItem { GameId = item.GameId, Quantity = item.Quantity })
                    .ToList(),
                PromoCode = request?.PromoCode,
                Currency = "USD",
                UserName = userId
            });

            if (!pricing.Success)
            {
                return BadRequest(pricing.Error ?? "Could not price your cart.");
            }

            var redirectBase = $"{Request.Scheme}://{Request.Host}";
            var metadata = new Dictionary<string, string> { ["userId"] = userId };

            try
            {
                // Инвойс в USD — BTCPay сам считает сумму в testnet-BTC по своему курсу.
                // {InvoiceId} — плейсхолдер BTCPay, подставит id инвойса при редиректе обратно.
                var invoice = await _btcPay.CreateInvoiceAsync(pricing.Total, $"{redirectBase}/checkout/success?crypto_invoice={{InvoiceId}}", metadata, ct);

                // Snapshot корзины: заказ создаст вебхук, когда инвойс будет оплачен.
                // Кладём СЕРВЕРНЫЕ цены — именно из этого снапшота потом строится заказ.
                await _invoiceStates.InsertOneAsync(new CryptoInvoiceStateDb
                {
                    InvoiceId = invoice.Id,
                    UserId = userId,
                    Subtotal = pricing.Subtotal,
                    DiscountTotal = pricing.DiscountTotal,
                    Total = pricing.Total,
                    CheckoutItems = pricing.Items,
                    CreatedAt = DateTime.UtcNow
                }, cancellationToken: ct);

                return Ok(new { invoiceId = invoice.Id, checkoutLink = invoice.CheckoutLink });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BTCPay invoice creation failed for user {UserId}", userId);
                return StatusCode(StatusCodes.Status502BadGateway, "Could not create crypto invoice.");
            }
        }

        /// <summary>
        /// Вебхук BTCPay. Подлинность — HMAC-SHA256 сырого тела с секретом вебхука (заголовок BTCPay-Sig).
        /// </summary>
        [HttpPost("webhook")]
        public async Task<IActionResult> Webhook(CancellationToken ct)
        {
            using var reader = new StreamReader(Request.Body);
            var rawBody = await reader.ReadToEndAsync(ct);

            if (!VerifySignature(rawBody, Request.Headers["BTCPay-Sig"].ToString()))
            {
                _logger.LogWarning("BTCPay webhook rejected: invalid signature");
                return Unauthorized();
            }

            using var document = JsonDocument.Parse(rawBody);
            var root = document.RootElement;
            var eventType = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            var invoiceId = root.TryGetProperty("invoiceId", out var i) ? i.GetString() : null;

            // Заказ создаём только по финальному "оплачено" (InvoiceSettled).
            if (eventType != "InvoiceSettled" || string.IsNullOrWhiteSpace(invoiceId))
            {
                return Ok();
            }

            await FinalizeInvoiceAsync(invoiceId, ct);
            return Ok();
        }

        /// <summary>Поллинг success-страницы: settled/orderId по invoiceId (только владелец инвойса).</summary>
        [Authorize]
        [HttpGet("status/{invoiceId}")]
        public async Task<IActionResult> GetStatus(string invoiceId, CancellationToken ct)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
            var state = await _invoiceStates.Find(item => item.InvoiceId == invoiceId).FirstOrDefaultAsync(ct);
            if (state == null || !string.Equals(state.UserId, userId, StringComparison.OrdinalIgnoreCase))
            {
                return NotFound();
            }

            // Страховка от потерянного вебхука: если BTCPay говорит Settled — финализируем прямо здесь.
            if (string.IsNullOrEmpty(state.OrderId) && _options.IsConfigured)
            {
                try
                {
                    var invoice = await _btcPay.GetInvoiceAsync(invoiceId, ct);
                    if (string.Equals(invoice.Status, "Settled", StringComparison.OrdinalIgnoreCase))
                    {
                        await FinalizeInvoiceAsync(invoiceId, ct);
                        state = await _invoiceStates.Find(item => item.InvoiceId == invoiceId).FirstOrDefaultAsync(ct);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "BTCPay status check failed for invoice {InvoiceId}", invoiceId);
                }
            }

            return Ok(new { settled = !string.IsNullOrEmpty(state?.OrderId), orderId = state?.OrderId });
        }

        private async Task FinalizeInvoiceAsync(string invoiceId, CancellationToken ct)
        {
            // Идемпотентность: помечаем состояние "в работе" атомарно, заказ создаёт только первый вызов.
            var claimed = await _invoiceStates.FindOneAndUpdateAsync<CryptoInvoiceStateDb>(
                item => item.InvoiceId == invoiceId && item.OrderId == null && !item.Finalizing,
                Builders<CryptoInvoiceStateDb>.Update.Set(item => item.Finalizing, true),
                new FindOneAndUpdateOptions<CryptoInvoiceStateDb> { ReturnDocument = ReturnDocument.After },
                ct);

            if (claimed == null)
            {
                return; // уже создан или создаётся
            }

            try
            {
                var now = DateTime.UtcNow;
                var orderId = Guid.NewGuid();
                var order = new Order
                {
                    Id = orderId,
                    OrderGuid = orderId,
                    UserId = claimed.UserId,
                    UserName = claimed.UserId,
                    PaymentProvider = "btcpay_testnet",
                    GameId = claimed.CheckoutItems.FirstOrDefault()?.GameId ?? string.Empty,
                    GameName = claimed.CheckoutItems.FirstOrDefault()?.Title ?? "Crypto checkout",
                    IsPaid = true,
                    IsFulfilled = false,
                    OrderDate = now,
                    CreatedAt = now,
                    PaidAt = now,
                    Status = "AWAITING_KEYS",
                    PaymentStatus = "PAID",
                    FulfillmentStatus = "PENDING_KEYS",
                    Currency = "USD",
                    SubtotalAmount = claimed.Subtotal,
                    DiscountTotal = claimed.DiscountTotal,
                    TotalAmount = claimed.Total,
                    Totals = new MoneyTotals { Subtotal = claimed.Subtotal, DiscountTotal = claimed.DiscountTotal, Total = claimed.Total },
                    Notes = $"BTCPay testnet invoice {invoiceId}",
                    Items = claimed.CheckoutItems.Select(item => new OrderItemSnapshot
                    {
                        GameId = item.GameId,
                        Title = item.Title,
                        CoverUrl = item.CoverUrl,
                        Quantity = Math.Max(1, item.Quantity),
                        UnitPrice = item.UnitPrice,
                        UnitDiscount = item.DiscountPerUnit,
                        FinalUnitPrice = item.FinalUnitPrice,
                        LineTotal = item.LineTotal
                    }).ToList()
                };

                await _orderRepository.CreateOrderAsync(order);
                await _keyFulfillmentService.FulfillOrderAsync(order);

                await _invoiceStates.UpdateOneAsync(
                    item => item.InvoiceId == invoiceId,
                    Builders<CryptoInvoiceStateDb>.Update
                        .Set(item => item.OrderId, order.Id.ToString())
                        .Set(item => item.Finalizing, false),
                    cancellationToken: ct);
            }
            catch
            {
                // Снимаем блокировку, чтобы поллинг/повторный вебхук мог повторить.
                await _invoiceStates.UpdateOneAsync(
                    item => item.InvoiceId == invoiceId,
                    Builders<CryptoInvoiceStateDb>.Update.Set(item => item.Finalizing, false),
                    cancellationToken: CancellationToken.None);
                throw;
            }
        }

        private bool VerifySignature(string rawBody, string signatureHeader)
        {
            if (string.IsNullOrWhiteSpace(_options.WebhookSecret))
            {
                // Секрет не задан — вебхук не принимаем вовсе (безопасный дефолт).
                return false;
            }

            if (string.IsNullOrWhiteSpace(signatureHeader) || !signatureHeader.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(_options.WebhookSecret), Encoding.UTF8.GetBytes(rawBody));
            byte[] provided;
            try
            {
                provided = Convert.FromHexString(signatureHeader["sha256=".Length..]);
            }
            catch
            {
                return false;
            }

            return CryptographicOperations.FixedTimeEquals(expected, provided);
        }

        /// <summary>
        /// Контракт намеренно НЕ содержит сумм — иначе снова открывается подмена цены.
        /// Клиент сообщает только что и сколько покупает.
        /// </summary>
        public class CryptoInvoiceRequest
        {
            public string? PromoCode { get; set; }
            public List<CryptoInvoiceItemRequest> Items { get; set; } = new();
        }

        public class CryptoInvoiceItemRequest
        {
            public string GameId { get; set; } = string.Empty;
            public int Quantity { get; set; }
        }

        public class CryptoInvoiceStateDb
        {
            [BsonId]
            public ObjectId Id { get; set; }
            public string InvoiceId { get; set; } = string.Empty;
            public string UserId { get; set; } = string.Empty;
            public decimal Subtotal { get; set; }
            public decimal DiscountTotal { get; set; }
            public decimal Total { get; set; }
            public string? OrderId { get; set; }
            public bool Finalizing { get; set; }
            public List<CheckoutLineItemStateDb> CheckoutItems { get; set; } = new();
            public DateTime CreatedAt { get; set; }
        }
    }
}
