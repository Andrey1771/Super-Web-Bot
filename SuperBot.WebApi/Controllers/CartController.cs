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
