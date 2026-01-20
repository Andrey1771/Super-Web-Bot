using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.IO.Compression;
using System.Security.Claims;
using System.Text.Json;
using System.Linq;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/account")]
    public class AccountDataExportController : ControllerBase
    {
        private readonly IBillingProfileRepository _billingProfileRepository;
        private readonly ISteamOrderRepository _steamOrderRepository;
        private readonly IWishlistRepository _wishlistRepository;
        private readonly CustomerService _customerService;
        private readonly PaymentMethodService _paymentMethodService;

        public AccountDataExportController(
            IBillingProfileRepository billingProfileRepository,
            ISteamOrderRepository steamOrderRepository,
            IWishlistRepository wishlistRepository)
        {
            _billingProfileRepository = billingProfileRepository;
            _steamOrderRepository = steamOrderRepository;
            _wishlistRepository = wishlistRepository;
            _customerService = new CustomerService();
            _paymentMethodService = new PaymentMethodService();
        }

        [HttpGet("data-export")]
        public async Task<IActionResult> Export()
        {
            var userId = GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

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
            }
            var orders = await _steamOrderRepository.GetAllOrdersAsync();
            var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);

            var paymentMethods = Array.Empty<object>();
            if (!string.IsNullOrWhiteSpace(profile?.StripeCustomerId))
            {
                var customer = await _customerService.GetAsync(profile.StripeCustomerId);
                var defaultPaymentMethodId = profile.DefaultPaymentMethodId ?? customer?.InvoiceSettings?.DefaultPaymentMethodId;
                var methods = await _paymentMethodService.ListAsync(new PaymentMethodListOptions
                {
                    Customer = profile.StripeCustomerId,
                    Type = "card"
                });

                paymentMethods = methods.Data.Select(method => new
                {
                    method.Id,
                    Brand = method.Card?.Brand,
                    Last4 = method.Card?.Last4,
                    ExpMonth = method.Card?.ExpMonth,
                    ExpYear = method.Card?.ExpYear,
                    IsDefault = method.Id == defaultPaymentMethodId
                }).ToArray();
            }

            var identifiers = GetUserIdentifiers();
            var exportPayload = new
            {
                Profile = profile,
                WishlistGameIds = wishlistIds,
                Orders = orders.Where(order => identifiers.Contains(order.Username)).Where(order => order.IsPaid).ToList(),
                PaymentMethods = paymentMethods,
                ExportedAt = DateTime.UtcNow
            };

            var json = JsonSerializer.Serialize(exportPayload, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            await using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                var entry = archive.CreateEntry("data-export.json");
                await using var entryStream = entry.Open();
                await using var writer = new StreamWriter(entryStream);
                await writer.WriteAsync(json);
            }

            memoryStream.Position = 0;
            return File(memoryStream.ToArray(), "application/zip", "tale-shop-data-export.zip");
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
    }
}
