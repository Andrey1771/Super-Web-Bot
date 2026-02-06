using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Support.Chat.Dto;
using SuperBot.WebApi.Support.Chat.Services;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/support/admin/chat")]
[Authorize(Policy = "SupportAgent")]
public class SupportChatAdminController : ControllerBase
{
    private readonly ISupportChatService _chatService;

    public SupportChatAdminController(ISupportChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet("sessions")]
    public async Task<ActionResult<ChatSessionListResponse>> ListSessions(
        [FromQuery] string? status,
        [FromQuery] string? q,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var result = await _chatService.ListSessionsAsync(status, q, page, pageSize);
        return Ok(result);
    }

    [HttpGet("sessions/{sessionId}")]
    public async Task<ActionResult<ChatSessionDetailDto>> GetSession(
        [FromRoute] string sessionId,
        [FromQuery] int messageLimit = 100)
    {
        try
        {
            var result = await _chatService.GetSessionForAdminAsync(sessionId, messageLimit);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("sessions/{sessionId}/assign")]
    public async Task<ActionResult<ChatSessionDto>> AssignSession([FromRoute] string sessionId)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var result = await _chatService.AssignSessionAsync(sessionId, userContext);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPatch("sessions/{sessionId}")]
    public async Task<ActionResult<ChatSessionDto>> UpdateSession(
        [FromRoute] string sessionId,
        [FromBody] UpdateChatSessionRequest request)
    {
        try
        {
            var result = await _chatService.UpdateSessionAsync(sessionId, request);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("sessions/{sessionId}/messages")]
    public async Task<ActionResult<ChatMessageDto>> AddAgentMessage(
        [FromRoute] string sessionId,
        [FromBody] ChatAgentMessageRequest request)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var message = await _chatService.AddAgentMessageAsync(sessionId, userContext, request.Text);
            return Ok(message);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }
}
