using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services.Cashback;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Отказ от писем о кэшбэке («стал доступен», «скоро сгорит»). Без входа — как и отписка от приглашений к отзывам:
/// требовать логин, чтобы попросить не писать, значит не дать отписаться. Ссылка подписана HMAC.
/// </summary>
[ApiController]
[Route("api/cashback/notices")]
[AllowAnonymous]
public class CashbackNoticesController : ControllerBase
{
    private readonly CashbackNoticeService _notices;

    public CashbackNoticesController(CashbackNoticeService notices)
    {
        _notices = notices;
    }

    /// <summary>POST со страницы, а не GET по ссылке: почтовые клиенты открывают ссылки заранее и отписывали бы сами.</summary>
    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] CashbackNoticeUnsubscribeRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Token))
        {
            return BadRequest(new { message = "Token is required." });
        }

        return await _notices.OptOutAsync(request.Token, ct)
            ? Ok(new { status = "unsubscribed" })
            : BadRequest(new { message = "This unsubscribe link is not valid." });
    }
}

public class CashbackNoticeUnsubscribeRequest
{
    public string? Token { get; set; }
}
