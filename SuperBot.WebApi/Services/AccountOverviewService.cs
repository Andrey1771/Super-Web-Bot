using System.Security.Claims;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.DTOs;

namespace SuperBot.WebApi.Services
{
    public class AccountOverviewService(IUserRepository userRepository, IOrderRepository orderRepository)
    {
        public async Task<AccountOverviewDto> BuildAsync(ClaimsPrincipal principal)
        {
            var email = GetClaimValue(principal, ClaimTypes.Email) ?? GetClaimValue(principal, "email");
            var username = GetClaimValue(principal, "preferred_username")
                           ?? GetClaimValue(principal, ClaimTypes.Name)
                           ?? email;
            var displayName = GetClaimValue(principal, "name") ?? username ?? email;
            var userId = GetClaimValue(principal, ClaimTypes.NameIdentifier) ?? GetClaimValue(principal, "sub");

            var userEntity = !string.IsNullOrWhiteSpace(username)
                ? await userRepository.FindByUsernameAsync(username)
                : null;

            if (userEntity == null && !string.IsNullOrWhiteSpace(email))
            {
                userEntity = await userRepository.FindByUsernameAsync(email);
            }

            var orders = await orderRepository.GetAllOrdersAsync();
            var userOrders = orders
                .Where(order => IsMatch(order.UserName, username) || IsMatch(order.UserName, email))
                .ToList();

            var recentOrders = userOrders
                .OrderByDescending(order => order.OrderDate)
                .Take(4)
                .Select(order => new AccountRecentOrderDto
                {
                    OrderId = order.Id.ToString(),
                    GameTitle = order.GameName,
                    Date = order.OrderDate,
                    Amount = null,
                    Currency = null,
                    Status = order.IsPaid ? "Completed" : "Pending",
                    InvoiceId = order.Id.ToString()
                })
                .ToList();

            return new AccountOverviewDto
            {
                User = new AccountUserDto
                {
                    Id = userId,
                    DisplayName = displayName,
                    Email = email,
                    VerifiedBuyer = userEntity != null,
                    MemberSince = userEntity?.CreatedAt,
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
                RecentKeys = new List<AccountRecentKeyDto>(),
                Recommendations = null
            };
        }

        private static string? GetClaimValue(ClaimsPrincipal principal, string claimType)
        {
            return principal.Claims.FirstOrDefault(c => c.Type == claimType)?.Value;
        }

        private static bool IsMatch(string? source, string? target)
        {
            if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(target))
            {
                return false;
            }

            return source.Equals(target, StringComparison.OrdinalIgnoreCase);
        }
    }
}
