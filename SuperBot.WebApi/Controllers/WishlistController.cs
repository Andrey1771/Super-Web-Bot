using Microsoft.AspNetCore.Mvc;
using System;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/wishlist")]
    [ApiController]
    public class WishlistController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetWishlist()
        {
            return Ok(Array.Empty<object>());
        }
    }
}
