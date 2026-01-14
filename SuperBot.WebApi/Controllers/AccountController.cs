using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.DTOs;
using SuperBot.WebApi.Services;
using System.Security.Claims;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AccountController(AccountOverviewService accountOverviewService, IOrderRepository orderRepository) : ControllerBase
    {
        [HttpGet("overview")]
        public async Task<ActionResult<AccountOverviewDto>> GetOverview()
        {
            var overview = await accountOverviewService.BuildAsync(User);
            return Ok(overview);
        }

        [HttpGet("orders/{orderId}/invoice")]
        public async Task<IActionResult> GetInvoice(string orderId)
        {
            var order = await orderRepository.GetOrderByIdAsync(orderId);
            if (order == null)
            {
                return NotFound();
            }

            var email = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value
                        ?? User.Claims.FirstOrDefault(c => c.Type == "email")?.Value;

            var pdf = InvoicePdfBuilder.Build(order, email);
            return File(pdf, "application/pdf", $"invoice-{orderId}.pdf");
        }
    }
}
