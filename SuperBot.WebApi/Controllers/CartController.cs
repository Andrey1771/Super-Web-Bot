using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CartController(ICartRepository _cartRepository) : ControllerBase
    {
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetCart(string userId) 
        {
            var cart = (await _cartRepository.GetCartAsync(userId)).FirstOrDefault();

            return Ok(cart);
        }

        [HttpGet()]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetAllCarts()
        {
            var carts = await _cartRepository.GetAllCartsAsync();

            return Ok(carts);
        }

        [HttpPost("{userId}")]
        public async Task<IActionResult> UpdateCart(string userId, [FromBody] Cart cart)
        {
            await _cartRepository.UpdateCartAsync(userId, cart);
            return Ok();
        }

        [HttpDelete("{userId}")]
        public async Task<IActionResult> ClearCart(string userId)
        {
            await _cartRepository.ClearCartAsync(userId);
            return NoContent();
        }
    }
}
