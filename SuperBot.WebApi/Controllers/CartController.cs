using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Common.Auth;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Корзина вошедшего покупателя на сервере (у гостя она живёт в браузере). Адрес содержит владельца — почту
    /// из токена, — поэтому каждый запрос сверяется с тем, кто вошёл: раньше любой, даже без входа, мог по чужой
    /// почте прочитать, подменить или очистить её корзину.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class CartController(ICartRepository _cartRepository) : ControllerBase
    {
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetCart(string userId)
        {
            if (!IsOwnCart(userId))
            {
                return NotFound();
            }
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
            if (!IsOwnCart(userId))
            {
                return NotFound();
            }
            await _cartRepository.UpdateCartAsync(userId, cart);
            return Ok();
        }

        [HttpDelete("{userId}")]
        public async Task<IActionResult> ClearCart(string userId)
        {
            if (!IsOwnCart(userId))
            {
                return NotFound();
            }
            await _cartRepository.ClearCartAsync(userId);
            return NoContent();
        }

        // Чужая корзина — «не найдена», а не «запрещено»: не подтверждаем, что у этой почты есть аккаунт.
        private bool IsOwnCart(string userId) =>
            !string.IsNullOrWhiteSpace(userId) && User.GetAccountIdentifiers().Contains(userId.Trim());
    }
}
