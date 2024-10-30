using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ReferralController : ControllerBase
    {
        private readonly IUrlService _urlService;

        public ReferralController(IUrlService urlService)
        {
            _urlService = urlService;
        }

        [HttpGet("{userId}")]
        public IActionResult RedirectToPersonalLink(long userId)
        {
            return Redirect("");//TODO Указать, когда фронт будет готов
        }
    }
}
