using System.Security.Claims;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.DTOs;

namespace SuperBot.WebApi.Services
{
    public class AccountOverviewService
    {
        private readonly IUserRepository _userRepository;
        private readonly IOrderRepository _orderRepository;

        public AccountOverviewService(IUserRepository userRepository, IOrderRepository orderRepository)
        {
            _userRepository = userRepository;
            _orderRepository = orderRepository;
        }

        public async Task<AccountOverviewDto> BuildOverviewAsync(ClaimsPrincipal principal)
        {
            var email = principal.FindFirst("email")?.Value ?? principal.FindFirst(ClaimTypes.Email)?.Value;
            var username = principal.FindFirst("preferred_username")?.Value
                           ?? principal.FindFirst(ClaimTypes.Name)?.Value
                           ?? principal.Identity?.Name;
            var fallbackIdentity = username ?? email ?? string.Empty;
            var displayName = principal.FindFirst("name")?.Value
                              ?? (!string.IsNullOrWhiteSpace(fallbackIdentity) ? fallbackIdentity : "Account");
            var resolvedEmail = !string.IsNullOrWhiteSpace(email) ? email : fallbackIdentity;

            var userEntity = !string.IsNullOrWhiteSpace(username)
                ? await _userRepository.FindByUsernameAsync(username)
                : null;

            var orders = await _orderRepository.GetAllOrdersAsync();
            var userOrders = orders
                .Where(order => IsOrderForUser(order.UserName, username, email))
                .OrderByDescending(order => order.OrderDate)
                .ToList();

            var recentOrders = userOrders
                .Take(4)
                .Select(order => new AccountOrderDto
                {
                    OrderId = order.Id.ToString(),
                    GameTitle = string.IsNullOrWhiteSpace(order.GameName) ? "Unknown game" : order.GameName,
                    Date = order.OrderDate,
                    Amount = null,
                    Currency = null,
                    Status = order.IsPaid ? "Completed" : "Pending",
                    InvoiceId = null
                })
                .ToList();

            return new AccountOverviewDto
            {
                User = new AccountUserDto
                {
                    Id = userEntity?.Id ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? string.Empty,
                    DisplayName = displayName,
                    Email = resolvedEmail,
                    VerifiedBuyer = userOrders.Any(),
                    MemberSince = userEntity?.CreatedAt ?? DateTime.UtcNow,
                    AvatarUrl = null
                },
                Counters = new AccountCountersDto
                {
                    OrdersCount = userOrders.Count,
                    ActiveKeysCount = 0,
                    SavedItemsCount = 0,
                    PaymentMethodsCount = 0
                },
                RecentOrders = recentOrders,
                RecentKeys = Array.Empty<AccountKeyDto>(),
                Recommendations = Array.Empty<AccountRecommendationDto>()
            };
        }

        private static bool IsOrderForUser(string orderUserName, string? username, string? email)
        {
            if (string.IsNullOrWhiteSpace(orderUserName))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(username) && orderUserName.Equals(username, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return !string.IsNullOrWhiteSpace(email) && orderUserName.Equals(email, StringComparison.OrdinalIgnoreCase);
        }
    }
}
