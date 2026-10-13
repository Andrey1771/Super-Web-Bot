using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SuperBot.Common.Auth;
using SuperBot.WebApi.Services;
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

    // Перебор промокодов: ответ «valid/invalid» сам по себе утечка, поэтому частота ограничена по адресу.
    [HttpPost("validate")]
    [EnableRateLimiting(PublicRateLimits.PromoValidation)]
    public async Task<IActionResult> Validate([FromBody] PromoValidateRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Code))
        {
            return BadRequest(new { valid = false, message = "Promo code is required.", messageCode = "promo.required" });
        }

        // Тот же ключ покупателя, что у заказов и учёта использований (email). С Identity.Name
        // проверка «один раз на покупателя» искала записи не под тем именем и не срабатывала.
        var userName = User.Identity?.IsAuthenticated == true ? User.GetUserKey() : null;
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
            // Код сообщения — для перевода на витрине; поле code занято самим промокодом.
            messageCode = result.MessageCode,
            code = result.NormalizedCode
        });
    }
}

public class PromoValidateRequest
{
    public string Code { get; set; } = string.Empty;
    public decimal CartSubtotal { get; set; }
}
