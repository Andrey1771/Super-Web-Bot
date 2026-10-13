using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using System.IO.Compression;
using System.Security.Claims;
using System.Text.Json;
using System.Linq;
using SuperBot.Common.Auth;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/account")]
    public class AccountDataExportController : ControllerBase
    {
        private readonly IBillingProfileRepository _billingProfileRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IWishlistRepository _wishlistRepository;
        private readonly CustomerService _customerService;
        private readonly PaymentMethodService _paymentMethodService;
        private readonly ILogger<AccountDataExportController> _logger;

        public AccountDataExportController(
            IBillingProfileRepository billingProfileRepository,
            IOrderRepository orderRepository,
            IWishlistRepository wishlistRepository,
            ILogger<AccountDataExportController> logger)
        {
            _billingProfileRepository = billingProfileRepository;
            _orderRepository = orderRepository;
            _wishlistRepository = wishlistRepository;
            _logger = logger;
            _customerService = new CustomerService();
            _paymentMethodService = new PaymentMethodService();
        }

        /// <summary>
        /// Копия своих данных (право доступа и переносимости, GDPR): профиль оплаты, оплаченные заказы, список
        /// желаемого и сохранённые карты (только система и последние цифры). Ключи активации в выгрузку не попадают:
        /// на сайте они открываются только после ввода пароля, и архив не должен обходить эту защиту.
        /// </summary>
        [HttpGet("data-export")]
        public async Task<IActionResult> Export()
        {
            var userId = User.GetUserId();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            // Скачивание ничего не записывает: нет профиля — выгружаем то, что известно из входа.
            var profile = await _billingProfileRepository.GetByUserIdAsync(userId) ?? new BillingProfile
            {
                UserId = userId,
                DisplayName = User.GetDisplayName(),
                Email = User.GetEmail()
            };
            // Только свои заказы и прямо запросом в базу — раньше читались все заказы магазина, да ещё из старой
            // коллекции SteamOrders, в которую магазин давно не пишет: заказов в выгрузке не было ни у кого.
            var orders = await _orderRepository.GetOrdersByUsersAsync(User.GetOrderOwnerAliases());
            var wishlistIds = await _wishlistRepository.GetGameIdsAsync(userId);

            var paymentMethods = Array.Empty<object>();
            if (!string.IsNullOrWhiteSpace(profile.StripeCustomerId))
            {
                try
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
                        Brand = method.Card?.Brand,
                        Last4 = method.Card?.Last4,
                        ExpMonth = method.Card?.ExpMonth,
                        ExpYear = method.Card?.ExpYear,
                        IsDefault = method.Id == defaultPaymentMethodId
                    }).ToArray();
                }
                catch (StripeException ex)
                {
                    // Stripe недоступен — отдаём остальное, а не ошибку на всю выгрузку.
                    _logger.LogWarning(ex, "Data export: saved cards are unavailable for {UserId}.", userId);
                }
            }

            var exportPayload = new
            {
                Profile = new
                {
                    profile.DisplayName,
                    profile.Email,
                    profile.BillingDetails
                },
                WishlistGameIds = wishlistIds,
                Orders = orders
                    .Where(order => order.IsPaid)
                    .OrderByDescending(order => order.PaidAt ?? order.OrderDate)
                    .Select(order => new
                    {
                        Order = string.IsNullOrWhiteSpace(order.OrderNumber) ? order.Id.ToString() : order.OrderNumber,
                        order.OrderDate,
                        order.PaidAt,
                        order.Status,
                        Currency = order.Currency ?? "USD",
                        order.SubtotalAmount,
                        order.DiscountTotal,
                        order.TaxTotal,
                        order.TotalAmount,
                        order.RefundedAmount,
                        order.PromoCode,
                        PaidWith = string.IsNullOrWhiteSpace(order.PaidWithLast4) ? order.PaidWithWallet : $"{order.PaidWithBrand} •••• {order.PaidWithLast4}",
                        order.BuyerCountry,
                        Items = order.Items.Select(item => new
                        {
                            item.Title,
                            item.EditionTitle,
                            item.Platform,
                            item.Quantity,
                            item.FinalUnitPrice,
                            item.LineTotal,
                            item.RefundedQuantity
                        })
                    })
                    .ToList(),
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

    }
}
