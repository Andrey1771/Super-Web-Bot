using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Recovery.Dto;
using SuperBot.WebApi.Recovery.Services;

namespace SuperBot.WebApi.Controllers
{
    // Публичная часть восстановления доступа: подача заявки (без логина),
    // отмена по токену из письма, статус/отмена из живой сессии.
    [ApiController]
    [Route("api/account-recovery")]
    public class AccountRecoveryController : ControllerBase
    {
        private readonly IRecoveryRequestService _recovery;

        public AccountRecoveryController(IRecoveryRequestService recovery)
        {
            _recovery = recovery;
        }

        [HttpPost("requests")]
        [AllowAnonymous]
        public async Task<IActionResult> CreateRequest([FromBody] CreateRecoveryRequestDto dto)
        {
            try
            {
                await _recovery.CreateAsync(dto, GetClientIp(), Request.Headers.UserAgent.ToString());
            }
            catch (RecoveryRequestException ex) when (ex.StatusCode == 400)
            {
                return BadRequest(new { message = ex.Message });
            }

            // Ответ всегда одинаковый — существование аккаунта и дубликаты заявок не раскрываем.
            return Ok(new { accepted = true });
        }

        [HttpPost("cancel-by-token")]
        [AllowAnonymous]
        public async Task<IActionResult> CancelByToken([FromBody] CancelByTokenDto dto)
        {
            var cancelled = await _recovery.CancelByTokenAsync(dto.Token);
            return Ok(new { cancelled });
        }

        [HttpGet("pending")]
        [Authorize]
        public async Task<ActionResult<PendingRecoveryDto>> GetPending()
        {
            return Ok(await _recovery.GetActiveForUserAsync(GetUserId()));
        }

        [HttpPost("pending/cancel")]
        [Authorize]
        public async Task<IActionResult> CancelPending()
        {
            var cancelled = await _recovery.CancelByUserAsync(GetUserId());
            return Ok(new { cancelled });
        }

        private string GetUserId()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        }

        private string GetClientIp()
        {
            // За nginx реальный адрес приходит в X-Forwarded-For (первый в списке).
            var forwarded = Request.Headers["X-Forwarded-For"].ToString();
            if (!string.IsNullOrWhiteSpace(forwarded))
            {
                return forwarded.Split(',')[0].Trim();
            }
            return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        }
    }

    public class CancelByTokenDto
    {
        public string Token { get; set; } = string.Empty;
    }
}
