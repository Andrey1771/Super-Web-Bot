using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Recovery.Dto;
using SuperBot.WebApi.Recovery.Services;

namespace SuperBot.WebApi.Controllers
{
    // Рабочее место оператора восстановления доступа. Доступ — та же политика, что у тикетов.
    [ApiController]
    [Route("api/account-recovery/admin")]
    [Authorize(Policy = "SupportAgent")]
    public class AccountRecoveryAdminController : ControllerBase
    {
        private readonly IRecoveryRequestService _recovery;

        public AccountRecoveryAdminController(IRecoveryRequestService recovery)
        {
            _recovery = recovery;
        }

        [HttpGet("requests")]
        public async Task<ActionResult<List<RecoveryRequestSummaryDto>>> List([FromQuery] string? status)
        {
            return Ok(await _recovery.ListAsync(status));
        }

        [HttpGet("requests/{id}")]
        public async Task<ActionResult<RecoveryRequestDetailDto>> Get(string id)
        {
            return await Handle(() => _recovery.GetDetailAsync(id));
        }

        [HttpPost("requests/{id}/checklist")]
        public async Task<ActionResult<RecoveryRequestDetailDto>> UpdateChecklist(string id, [FromBody] UpdateChecklistDto dto)
        {
            return await Handle(() => _recovery.UpdateChecklistAsync(id, dto, GetActor()));
        }

        [HttpPost("requests/{id}/approve")]
        public async Task<ActionResult<RecoveryRequestDetailDto>> Approve(string id)
        {
            return await Handle(() => _recovery.ApproveAsync(id, GetActor()));
        }

        [HttpPost("requests/{id}/reject")]
        public async Task<ActionResult<RecoveryRequestDetailDto>> Reject(string id, [FromBody] RejectRecoveryDto dto)
        {
            return await Handle(() => _recovery.RejectAsync(id, GetActor(), dto.Reason));
        }

        [HttpPost("requests/{id}/execute")]
        public async Task<ActionResult<RecoveryRequestDetailDto>> Execute(string id)
        {
            return await Handle(() => _recovery.ExecuteAsync(id, GetActor()));
        }

        private async Task<ActionResult<RecoveryRequestDetailDto>> Handle(Func<Task<RecoveryRequestDetailDto>> action)
        {
            try
            {
                return Ok(await action());
            }
            catch (RecoveryRequestException ex)
            {
                return Problem(ex.Message, statusCode: ex.StatusCode);
            }
        }

        private string GetActor()
        {
            return User.FindFirstValue("preferred_username")
                   ?? User.FindFirstValue(ClaimTypes.Email)
                   ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? "unknown";
        }
    }
}
