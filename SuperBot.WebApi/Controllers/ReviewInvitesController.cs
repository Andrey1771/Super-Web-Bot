using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services.ReviewInvites;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Отказ от писем «расскажите, как вам игра».
///
/// Без авторизации намеренно: письмо уходит и гостю, у которого аккаунта нет вовсе, а
/// требовать войти, чтобы попросить больше не писать, — способ не дать отписаться.
/// Ссылка подписана HMAC (см. <see cref="IReviewInviteTokenService"/>), так что подобрать
/// чужую нельзя, а перебирать нечего: успех и провал отвечают одинаково быстро.
/// </summary>
[ApiController]
[Route("api/reviews/invites")]
[AllowAnonymous]
public class ReviewInvitesController : ControllerBase
{
    private readonly ReviewInviteService _invites;

    public ReviewInvitesController(ReviewInviteService invites)
    {
        _invites = invites;
    }

    /// <summary>
    /// POST, а не GET по самой ссылке из письма: почтовые клиенты и антивирусы открывают
    /// ссылки заранее, и на GET отписка срабатывала бы без ведома человека. Ссылка ведёт на
    /// страницу, страница вызывает этот метод.
    /// </summary>
    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] ReviewInviteUnsubscribeRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Token))
        {
            return BadRequest(new { message = "Token is required." });
        }

        var ok = await _invites.OptOutAsync(request.Token, ct);
        if (!ok)
        {
            return BadRequest(new { message = "This unsubscribe link is not valid." });
        }

        return Ok(new { status = "unsubscribed" });
    }
}

public class ReviewInviteUnsubscribeRequest
{
    public string? Token { get; set; }
}
