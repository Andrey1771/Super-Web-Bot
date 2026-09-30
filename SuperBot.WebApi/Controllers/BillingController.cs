using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Services;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;
using System.Text;
using System.Linq;
using SuperBot.Common.Auth;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/billing")]
    public class BillingController : ControllerBase
    {
        private readonly IBillingProfileRepository _billingProfileRepository;
        private readonly ISteamOrderRepository _steamOrderRepository;
        private readonly IStripeCustomerGateway _stripe;
        private readonly SuperBot.WebApi.Services.IBillingCustomers _billingCustomers;
        private readonly ILogger<BillingController> _logger;

        public BillingController(
            IBillingProfileRepository billingProfileRepository,
            ISteamOrderRepository steamOrderRepository,
            IStripeCustomerGateway stripe,
            SuperBot.WebApi.Services.IBillingCustomers billingCustomers,
            ILogger<BillingController> logger)
        {
            _billingProfileRepository = billingProfileRepository;
            _steamOrderRepository = steamOrderRepository;
            _stripe = stripe;
            _billingCustomers = billingCustomers;
            _logger = logger;
        }

        [HttpGet("profile")]
        public async Task<ActionResult<BillingProfileDto>> GetProfile()
        {
            var userId = User.GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var profile = await GetOrCreateProfileAsync(userId);
            return Ok(MapProfile(profile));
        }

        [HttpPut("profile")]
        public async Task<ActionResult<BillingProfileDto>> UpdateProfile([FromBody] BillingProfileUpdateRequest request)
        {
            if (request == null)
            {
                return BadRequest("Profile payload is required.");
            }

            var userId = User.GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var profile = await GetOrCreateProfileAsync(userId);
            if (!string.IsNullOrWhiteSpace(request.DisplayName))
            {
                profile.DisplayName = request.DisplayName;
            }

            if (request.BillingDetails != null)
            {
                profile.BillingDetails = new BillingDetails
                {
                    AddressLine1 = request.BillingDetails.AddressLine1,
                    City = request.BillingDetails.City,
                    PostalCode = request.BillingDetails.PostalCode,
                    Country = request.BillingDetails.Country,
                    Phone = request.BillingDetails.Phone
                };
            }

            if (request.HideOwnedGamesInProfile.HasValue)
            {
                profile.HideOwnedGamesInProfile = request.HideOwnedGamesInProfile.Value;
            }

            await _billingProfileRepository.UpsertAsync(profile);
            return Ok(MapProfile(profile));
        }

        [HttpGet("payment-methods")]
        public async Task<ActionResult<IReadOnlyList<PaymentMethodDto>>> GetPaymentMethods()
        {
            var profile = await GetProfileAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            // Карта привязывается только к клиенту, которого создали мы. Нет клиента — карт
            // заведомо нет, и это известно здесь, в своей базе. Раньше кабинет ради ответа
            // «карт нет» заводил клиента в Stripe и делал три запроса наружу; из-за этого
            // страница ещё и падала, когда Stripe недоступен.
            if (string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                return Ok(new List<PaymentMethodDto>());
            }

            var defaultPaymentMethodId = profile.DefaultPaymentMethodId
                ?? await _stripe.GetDefaultPaymentMethodIdAsync(profile.StripeCustomerId);

            var cards = await _stripe.ListCardsAsync(profile.StripeCustomerId);

            var result = cards.Select(card => new PaymentMethodDto
            {
                Id = card.Id,
                Brand = card.Brand,
                Last4 = card.Last4,
                ExpMonth = card.ExpMonth,
                ExpYear = card.ExpYear,
                IsDefault = card.Id == defaultPaymentMethodId,
                Label = card.Id == defaultPaymentMethodId ? "Default" : null
            }).ToList();

            return Ok(result);
        }

        [HttpPost("payment-methods/setup-intent")]
        public async Task<ActionResult<SetupIntentResponse>> CreateSetupIntent()
        {
            var profile = await GetProfileAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            // Единственное место, где клиент действительно нужен: SetupIntent привязывает
            // карту к клиенту, без него привязывать не к чему.
            await EnsureStripeCustomerAsync(profile);

            var clientSecret = await _stripe.CreateSetupIntentAsync(profile.StripeCustomerId);

            return Ok(new SetupIntentResponse
            {
                ClientSecret = clientSecret
            });
        }

        [HttpPost("payment-methods/set-default")]
        public async Task<IActionResult> SetDefaultPaymentMethod([FromBody] SetDefaultPaymentMethodRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            {
                return BadRequest("PaymentMethodId is required.");
            }

            var profile = await GetProfileAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            // Ни одной карты не привязано — назначать по умолчанию нечего. Заводить ради
            // этого клиента бессмысленно: операция всё равно невыполнима.
            if (string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                return NotFound("No saved cards.");
            }

            await _stripe.SetDefaultCardAsync(profile.StripeCustomerId, request.PaymentMethodId);

            profile.DefaultPaymentMethodId = request.PaymentMethodId;
            await _billingProfileRepository.UpsertAsync(profile);

            return Ok();
        }

        [HttpDelete("payment-methods/{paymentMethodId}")]
        public async Task<IActionResult> DeletePaymentMethod(string paymentMethodId)
        {
            if (string.IsNullOrWhiteSpace(paymentMethodId))
            {
                return BadRequest("PaymentMethodId is required.");
            }

            var profile = await GetProfileAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                return NotFound("No saved cards.");
            }

            // Проверка владельца. Раньше detach уходил в Stripe по любому идентификатору из
            // адреса: авторизованный посетитель, знающий чужой pm_…, отвязывал чужую карту.
            // Идентификаторы случайные, но проверки не было вовсе.
            var card = await _stripe.GetCardAsync(paymentMethodId);
            if (card == null || !string.Equals(card.CustomerId, profile.StripeCustomerId, StringComparison.Ordinal))
            {
                // «Нет такой» и «не ваша» отвечаются одинаково: иначе ответ подсказывал бы,
                // какие идентификаторы существуют.
                return NotFound();
            }

            await _stripe.DetachCardAsync(paymentMethodId);

            if (profile.DefaultPaymentMethodId == paymentMethodId)
            {
                var remaining = await _stripe.ListCardsAsync(profile.StripeCustomerId);
                var newDefault = remaining.FirstOrDefault();

                await _stripe.SetDefaultCardAsync(profile.StripeCustomerId, newDefault?.Id);

                profile.DefaultPaymentMethodId = newDefault?.Id;
                await _billingProfileRepository.UpsertAsync(profile);
            }

            return Ok();
        }

        [HttpGet("invoices")]
        public async Task<ActionResult<InvoicePageDto>> GetInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            var identifiers = User.GetAccountIdentifiers();
            if (identifiers.Count == 0)
            {
                return Unauthorized();
            }

            var normalizedPage = Math.Max(1, page);
            var normalizedPageSize = Math.Clamp(pageSize, 1, 50);

            var orders = await _steamOrderRepository.GetAllOrdersAsync();
            var userOrders = orders
                .Where(order => identifiers.Contains(order.Username))
                .Where(order => order.IsPaid)
                .OrderByDescending(order => order.OrderCreationDate)
                .ToList();

            var totalCount = userOrders.Count;
            _logger.LogInformation("Billing invoices fetched for {UserId}. Count: {Count}.", User.GetUserId(), totalCount);
            var pageItems = userOrders
                .Skip((normalizedPage - 1) * normalizedPageSize)
                .Take(normalizedPageSize)
                .Select(order => new InvoiceDto
                {
                    Id = order.Id,
                    OrderId = order.PayId ?? order.Id,
                    Date = order.OrderCreationDate,
                    Amount = order.TotalAmount,
                    Currency = "usd",
                    PdfAvailable = true
                })
                .ToList();

            return Ok(new InvoicePageDto
            {
                Items = pageItems,
                TotalCount = totalCount,
                Page = normalizedPage,
                PageSize = normalizedPageSize
            });
        }

        [HttpGet("invoices/{invoiceId}/pdf")]
        public async Task<IActionResult> DownloadInvoicePdf(string invoiceId)
        {
            if (string.IsNullOrWhiteSpace(invoiceId))
            {
                return BadRequest("InvoiceId is required.");
            }

            var order = await _steamOrderRepository.GetOrderByIdAsync(invoiceId);
            if (order == null)
            {
                return NotFound();
            }
            var identifiers = User.GetAccountIdentifiers();
            if (!identifiers.Contains(order.Username))
            {
                return Forbid();
            }

            var profile = await GetOrCreateProfileAsync(User.GetUserId());
            var lines = new List<string>
            {
                "Tale Shop Invoice",
                $"Invoice ID: {order.Id}",
                $"Order ID: {order.PayId ?? order.Id}",
                $"Customer: {profile?.DisplayName}",
                $"Email: {profile?.Email}",
                $"Date: {order.OrderCreationDate:yyyy-MM-dd}",
                $"Amount: {order.TotalAmount:0.00} USD"
            };

            var pdfBytes = BuildSimplePdf(lines);
            var filename = $"invoice_{order.PayId ?? order.Id}.pdf";
            return File(pdfBytes, "application/pdf", filename);
        }

        private async Task<BillingProfile> GetOrCreateProfileAsync(string userId)
        {
            var profile = await _billingProfileRepository.GetByUserIdAsync(userId);
            if (profile == null)
            {
                profile = new BillingProfile
                {
                    UserId = userId,
                    DisplayName = User.GetDisplayName(),
                    Email = User.GetEmail(),
                    HideOwnedGamesInProfile = false
                };
                await _billingProfileRepository.UpsertAsync(profile);
                return profile;
            }

            var updated = false;
            if (string.IsNullOrWhiteSpace(profile.DisplayName))
            {
                profile.DisplayName = User.GetDisplayName();
                updated = true;
            }

            if (string.IsNullOrWhiteSpace(profile.Email))
            {
                profile.Email = User.GetEmail();
                updated = true;
            }

            if (updated)
            {
                await _billingProfileRepository.UpsertAsync(profile);
            }

            return profile;
        }

        /// <summary>
        /// Профиль покупателя из своей базы. В Stripe не ходит: раньше это делал один
        /// помощник на всё, и «покажи мои карты» попутно заводило клиента в Stripe даже
        /// тому, кто никогда ничего не оплатит.
        /// </summary>
        private async Task<BillingProfile> GetProfileAsync()
        {
            var userId = User.GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            return await GetOrCreateProfileAsync(userId);
        }

        /// <summary>
        /// Заводит покупателя в Stripe, если его ещё нет. Тот же покупатель, что и у кассы (см. BillingCustomers):
        /// карта, сохранённая при оплате, и карта, добавленная здесь, лежат у одного покупателя.
        /// </summary>
        private async Task EnsureStripeCustomerAsync(BillingProfile profile)
        {
            if (!string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                return;
            }

            profile.StripeCustomerId = await _billingCustomers.EnsureStripeCustomerAsync(User);
        }

        private BillingProfileDto MapProfile(BillingProfile profile)
        {
            return new BillingProfileDto
            {
                DisplayName = profile.DisplayName,
                Email = profile.Email,
                HideOwnedGamesInProfile = profile.HideOwnedGamesInProfile,
                BillingDetails = profile.BillingDetails == null
                    ? null
                    : new BillingDetailsDto
                    {
                        AddressLine1 = profile.BillingDetails.AddressLine1,
                        City = profile.BillingDetails.City,
                        PostalCode = profile.BillingDetails.PostalCode,
                        Country = profile.BillingDetails.Country,
                        Phone = profile.BillingDetails.Phone
                    }
            };
        }

        private static string EscapePdf(string value)
        {
            return value?.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)") ?? string.Empty;
        }

        private static byte[] BuildSimplePdf(IEnumerable<string> lines)
        {
            var contentBuilder = new StringBuilder();
            contentBuilder.Append("BT\n/F1 12 Tf\n72 720 Td\n");
            var lineIndex = 0;
            foreach (var line in lines)
            {
                if (lineIndex > 0)
                {
                    contentBuilder.Append("0 -18 Td\n");
                }
                contentBuilder.Append($"({EscapePdf(line)}) Tj\n");
                lineIndex++;
            }
            contentBuilder.Append("ET");

            var content = contentBuilder.ToString();
            var objects = new List<string>
            {
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
                $"<< /Length {content.Length} >>\nstream\n{content}\nendstream",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
            };

            var builder = new StringBuilder();
            builder.Append("%PDF-1.4\n");
            var offsets = new List<int>();
            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(builder.Length);
                builder.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
            }

            var xrefPosition = builder.Length;
            builder.Append($"xref\n0 {objects.Count + 1}\n");
            builder.Append("0000000000 65535 f \n");
            foreach (var offset in offsets)
            {
                builder.Append($"{offset:D10} 00000 n \n");
            }
            builder.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefPosition}\n%%EOF");

            return Encoding.ASCII.GetBytes(builder.ToString());
        }
    }

    public class BillingProfileDto
    {
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public BillingDetailsDto BillingDetails { get; set; }
        public bool HideOwnedGamesInProfile { get; set; }
    }

    public class BillingDetailsDto
    {
        public string AddressLine1 { get; set; }
        public string City { get; set; }
        public string PostalCode { get; set; }
        public string Country { get; set; }
        public string Phone { get; set; }
    }

    public class BillingProfileUpdateRequest
    {
        public string DisplayName { get; set; }
        public BillingDetailsDto BillingDetails { get; set; }
        public bool? HideOwnedGamesInProfile { get; set; }
    }

    public class PaymentMethodDto
    {
        public string Id { get; set; }
        public string Brand { get; set; }
        public string Last4 { get; set; }
        public long ExpMonth { get; set; }
        public long ExpYear { get; set; }
        public bool IsDefault { get; set; }
        public string Label { get; set; }
    }

    public class SetupIntentResponse
    {
        public string ClientSecret { get; set; }
    }

    public class SetDefaultPaymentMethodRequest
    {
        public string PaymentMethodId { get; set; }
    }

    public class InvoiceDto
    {
        public string Id { get; set; }
        public string OrderId { get; set; }
        public DateTime Date { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; }
        public bool PdfAvailable { get; set; }
    }

    public class InvoicePageDto
    {
        public List<InvoiceDto> Items { get; set; }
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }
}
