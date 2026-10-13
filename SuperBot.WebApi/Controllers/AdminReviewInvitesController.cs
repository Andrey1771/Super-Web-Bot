using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Services.ReviewInvites;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Ручной запуск рассылки приглашений оставить отзыв.
///
/// Нужен не ради тестов: первый прогон после включения стоит сделать под присмотром и
/// посмотреть, сколько писем уйдёт, а не узнать это утром из жалоб. Дальше задача работает
/// сама раз в сутки, и обе точки входа — один и тот же метод с одними и теми же отказами,
/// так что «руками» ничего лишнего не разошлёт.
/// </summary>
[ApiController]
[Route("api/admin/reviews/invites")]
[Authorize(Roles = "admin")]
public class AdminReviewInvitesController : ControllerBase
{
    private readonly ReviewInviteService _invites;

    public AdminReviewInvitesController(ReviewInviteService invites)
    {
        _invites = invites;
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run(CancellationToken ct)
    {
        var result = await _invites.RunAsync(ct);
        return Ok(new
        {
            enabled = result.Enabled,
            considered = result.Considered,
            sent = result.Sent,
            failed = result.Failed,
        });
    }
}
