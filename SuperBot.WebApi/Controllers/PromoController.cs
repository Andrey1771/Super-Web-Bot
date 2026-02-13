using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/promo")]
public class PromoController : ControllerBase
{
    private readonly IPromoCodeService _promoCodeService;

    public PromoController(IPromoCodeService promoCodeService)
    {
        _promoCodeService = promoCodeService;
    }

    [HttpPost("validate")]
    public async Task<IActionResult> Validate([FromBody] PromoValidateRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Code))
        {
            return BadRequest(new { valid = false, message = "Promo code is required." });
        }

        var userName = User.Identity?.Name ?? User.FindFirst("preferred_username")?.Value;
        var result = await _promoCodeService.ValidateAsync(new PromoValidationRequest
        {
            Code = request.Code,
            CartSubtotal = request.CartSubtotal,
            UserName = userName
        });

        return Ok(new
        {
            valid = result.Valid,
            discountAmount = result.DiscountAmount,
            finalTotal = result.FinalTotal,
            message = result.Message,
            code = result.NormalizedCode
        });
    }
}

public class PromoValidateRequest
{
    public string Code { get; set; } = string.Empty;
    public decimal CartSubtotal { get; set; }
}
