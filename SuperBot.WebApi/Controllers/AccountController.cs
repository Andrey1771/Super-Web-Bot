using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.DTOs;
using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AccountController : ControllerBase
    {
        private readonly AccountOverviewService _overviewService;
        private readonly IOrderRepository _orderRepository;

        public AccountController(AccountOverviewService overviewService, IOrderRepository orderRepository)
        {
            _overviewService = overviewService;
            _orderRepository = orderRepository;
        }

        [HttpGet("overview")]
        public async Task<ActionResult<AccountOverviewDto>> GetOverview()
        {
            var overview = await _overviewService.BuildOverviewAsync(User);
            return Ok(overview);
        }

        [HttpGet("orders/{orderId}/invoice")]
        public async Task<IActionResult> GetInvoice(string orderId)
        {
            var order = await _orderRepository.GetOrderByIdAsync(orderId);
            if (order == null)
            {
                return NotFound();
            }

            var email = User.FindFirst("email")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
            var username = User.FindFirst("preferred_username")?.Value
                           ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                           ?? User.Identity?.Name;

            if (!IsOrderForUser(order.UserName, username, email))
            {
                return NotFound();
            }

            return NotFound();
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
