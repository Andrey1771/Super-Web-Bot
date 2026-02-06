using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Support.Chat.Dto;
using SuperBot.WebApi.Support.Chat.Services;
using SuperBot.WebApi.Support.Infrastructure;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/support/chat")]
public class SupportChatController : ControllerBase
{
    private readonly ISupportChatService _chatService;

    public SupportChatController(ISupportChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet("config")]
    [AllowAnonymous]
    public async Task<ActionResult<ChatConfigDto>> GetConfig()
    {
        var config = await _chatService.GetConfigAsync();
        return Ok(config);
    }

    [HttpPost("sessions")]
    [AllowAnonymous]
    public async Task<ActionResult<CreateChatSessionResponse>> CreateSession([FromBody] CreateChatSessionRequest request)
    {
        try
        {
            var userContext = User.Identity?.IsAuthenticated == true
                ? SupportUserContext.FromClaims(User)
                : null;
            var response = await _chatService.CreateSessionAsync(userContext, request);
            return Ok(response);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpGet("sessions/{sessionId}")]
    [AllowAnonymous]
    public async Task<ActionResult<ChatSessionDetailDto>> GetSession(
        [FromRoute] string sessionId,
        [FromQuery] int messageLimit = 50)
    {
        try
        {
            var result = await _chatService.GetSessionAsync(sessionId, messageLimit);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpGet("sessions/{sessionId}/messages")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<ChatMessageDto>>> GetMessages(
        [FromRoute] string sessionId,
        [FromQuery] DateTime? after)
    {
        try
        {
            var result = await _chatService.GetMessagesAsync(sessionId, after);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("sessions/{sessionId}/messages")]
    [AllowAnonymous]
    public async Task<ActionResult<AddChatMessageResponse>> AddMessage(
        [FromRoute] string sessionId,
        [FromBody] AddChatMessageRequest request)
    {
        try
        {
            var userContext = User.Identity?.IsAuthenticated == true
                ? SupportUserContext.FromClaims(User)
                : null;
            var result = await _chatService.AddUserMessageAsync(sessionId, userContext, request.Text);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("sessions/{sessionId}/stream")]
    [AllowAnonymous]
    public async Task StreamMessage(
        [FromRoute] string sessionId,
        [FromBody] AddChatMessageRequest request,
        CancellationToken cancellationToken)
    {
        Response.ContentType = "text/event-stream";
        try
        {
            var userContext = User.Identity?.IsAuthenticated == true
                ? SupportUserContext.FromClaims(User)
                : null;

            var message = await _chatService.StreamAssistantResponseAsync(
                sessionId,
                userContext,
                request.Text,
                async chunk =>
                {
                    var payload = JsonSerializer.Serialize(new { text = chunk });
                    await Response.WriteAsync($"data: {payload}\n\n", cancellationToken);
                    await Response.Body.FlushAsync(cancellationToken);
                },
                cancellationToken);

            var donePayload = JsonSerializer.Serialize(new { message });
            await Response.WriteAsync($"event: done\ndata: {donePayload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
        catch (SupportChatRequestException ex)
        {
            var errorPayload = JsonSerializer.Serialize(new { error = ex.Message });
            await Response.WriteAsync($"event: error\ndata: {errorPayload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
    }
}
