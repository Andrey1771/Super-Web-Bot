using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.Security.Claims;
using System.Text;
using System.Linq;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/billing")]
    public class BillingController : ControllerBase
    {
        private readonly IBillingProfileRepository _billingProfileRepository;
        private readonly ISteamOrderRepository _steamOrderRepository;
        private readonly CustomerService _customerService;
        private readonly PaymentMethodService _paymentMethodService;
        private readonly SetupIntentService _setupIntentService;
        private readonly ILogger<BillingController> _logger;

        public BillingController(
            IBillingProfileRepository billingProfileRepository,
            ISteamOrderRepository steamOrderRepository,
            ILogger<BillingController> logger)
        {
            _billingProfileRepository = billingProfileRepository;
            _steamOrderRepository = steamOrderRepository;
            _customerService = new CustomerService();
            _paymentMethodService = new PaymentMethodService();
            _setupIntentService = new SetupIntentService();
            _logger = logger;
        }

        [HttpGet("profile")]
        public async Task<ActionResult<BillingProfileDto>> GetProfile()
        {
            var userId = GetUserId();
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

            var userId = GetUserId();
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
            var profile = await GetProfileForStripeAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            var customer = await _customerService.GetAsync(profile.StripeCustomerId);
            var defaultPaymentMethodId = profile.DefaultPaymentMethodId ?? customer?.InvoiceSettings?.DefaultPaymentMethodId;

            var paymentMethods = await _paymentMethodService.ListAsync(new PaymentMethodListOptions
            {
                Customer = profile.StripeCustomerId,
                Type = "card"
            });

            var result = paymentMethods.Data.Select(method => new PaymentMethodDto
            {
                Id = method.Id,
                Brand = method.Card?.Brand ?? "Card",
                Last4 = method.Card?.Last4 ?? "",
                ExpMonth = method.Card?.ExpMonth ?? 0,
                ExpYear = method.Card?.ExpYear ?? 0,
                IsDefault = method.Id == defaultPaymentMethodId,
                Label = method.Id == defaultPaymentMethodId ? "Default" : null
            }).ToList();

            return Ok(result);
        }

        [HttpPost("payment-methods/setup-intent")]
        public async Task<ActionResult<SetupIntentResponse>> CreateSetupIntent()
        {
            var profile = await GetProfileForStripeAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            var intent = await _setupIntentService.CreateAsync(new SetupIntentCreateOptions
            {
                Customer = profile.StripeCustomerId,
                PaymentMethodTypes = new List<string> { "card" },
                Usage = "off_session"
            });

            return Ok(new SetupIntentResponse
            {
                ClientSecret = intent.ClientSecret
            });
        }

        [HttpPost("payment-methods/set-default")]
        public async Task<IActionResult> SetDefaultPaymentMethod([FromBody] SetDefaultPaymentMethodRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            {
                return BadRequest("PaymentMethodId is required.");
            }

            var profile = await GetProfileForStripeAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            await _customerService.UpdateAsync(profile.StripeCustomerId, new CustomerUpdateOptions
            {
                InvoiceSettings = new CustomerInvoiceSettingsOptions
                {
                    DefaultPaymentMethod = request.PaymentMethodId
                }
            });

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

            var profile = await GetProfileForStripeAsync();
            if (profile == null)
            {
                return Unauthorized();
            }

            await _paymentMethodService.DetachAsync(paymentMethodId);

            if (profile.DefaultPaymentMethodId == paymentMethodId)
            {
                profile.DefaultPaymentMethodId = null;
                var remaining = await _paymentMethodService.ListAsync(new PaymentMethodListOptions
                {
                    Customer = profile.StripeCustomerId,
                    Type = "card"
                });

                var newDefault = remaining.Data.FirstOrDefault();
                await _customerService.UpdateAsync(profile.StripeCustomerId, new CustomerUpdateOptions
                {
                    InvoiceSettings = new CustomerInvoiceSettingsOptions
                    {
                        DefaultPaymentMethod = newDefault?.Id
                    }
                });

                profile.DefaultPaymentMethodId = newDefault?.Id;
                await _billingProfileRepository.UpsertAsync(profile);
            }

            return Ok();
        }

        [HttpGet("invoices")]
        public async Task<ActionResult<InvoicePageDto>> GetInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            var identifiers = GetUserIdentifiers();
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
            _logger.LogInformation("Billing invoices fetched for {UserId}. Count: {Count}.", GetUserId(), totalCount);
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
            var identifiers = GetUserIdentifiers();
            if (!identifiers.Contains(order.Username))
            {
                return Forbid();
            }

            var profile = await GetOrCreateProfileAsync(GetUserId());
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
                    DisplayName = GetDisplayName(),
                    Email = GetEmail(),
                    HideOwnedGamesInProfile = false
                };
                await _billingProfileRepository.UpsertAsync(profile);
                return profile;
            }

            var updated = false;
            if (string.IsNullOrWhiteSpace(profile.DisplayName))
            {
                profile.DisplayName = GetDisplayName();
                updated = true;
            }

            if (string.IsNullOrWhiteSpace(profile.Email))
            {
                profile.Email = GetEmail();
                updated = true;
            }

            if (updated)
            {
                await _billingProfileRepository.UpsertAsync(profile);
            }

            return profile;
        }

        private async Task<BillingProfile> GetProfileForStripeAsync()
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return null;
            }

            var profile = await GetOrCreateProfileAsync(userId);
            if (string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                var customer = await _customerService.CreateAsync(new CustomerCreateOptions
                {
                    Email = profile.Email,
                    Name = profile.DisplayName
                });
                profile.StripeCustomerId = customer.Id;
                await _billingProfileRepository.UpsertAsync(profile);
            }

            return profile;
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

        private string GetUserId()
        {
            return User?.FindFirst("sub")?.Value
                ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User?.FindFirst("email")?.Value
                ?? User?.FindFirst(ClaimTypes.Email)?.Value
                ?? User?.FindFirst("preferred_username")?.Value
                ?? string.Empty;
        }

        private string GetEmail()
        {
            return User?.FindFirst("email")?.Value
                ?? User?.FindFirst(ClaimTypes.Email)?.Value
                ?? string.Empty;
        }

        private string GetDisplayName()
        {
            return User?.FindFirst("name")?.Value
                ?? User?.FindFirst("preferred_username")?.Value
                ?? GetEmail();
        }

        private HashSet<string> GetUserIdentifiers()
        {
            var identifiers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var userId = GetUserId();
            if (!string.IsNullOrWhiteSpace(userId))
            {
                identifiers.Add(userId);
            }

            var email = GetEmail();
            if (!string.IsNullOrWhiteSpace(email))
            {
                identifiers.Add(email);
            }

            var username = User?.FindFirst("preferred_username")?.Value;
            if (!string.IsNullOrWhiteSpace(username))
            {
                identifiers.Add(username);
            }

            return identifiers;
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
