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
    private readonly ILogger _streamLogger;
    private readonly ILogger _pollLogger;

    public SupportChatController(ISupportChatService chatService, ILoggerFactory loggerFactory)
    {
        _chatService = chatService;
        _streamLogger = loggerFactory.CreateLogger("SupportChat.Stream");
        _pollLogger = loggerFactory.CreateLogger("SupportChat.Poll");
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
            _pollLogger.LogInformation("Support chat poll started. SessionId={SessionId} After={After}", sessionId, after);
            var result = await _chatService.GetMessagesAsync(sessionId, after);
            _pollLogger.LogInformation("Support chat poll finished. SessionId={SessionId} Count={Count}", sessionId, result.Count);
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
            _streamLogger.LogInformation("Support chat stream started. SessionId={SessionId}", sessionId);
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
            _streamLogger.LogInformation("Support chat stream finished. SessionId={SessionId}", sessionId);
        }
        catch (SupportChatRequestException ex)
        {
            var errorPayload = JsonSerializer.Serialize(new { error = ex.Message });
            await Response.WriteAsync($"event: error\ndata: {errorPayload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
            _streamLogger.LogWarning("Support chat stream failed. SessionId={SessionId} Error={Error}", sessionId, ex.Message);
        }
    }
}
