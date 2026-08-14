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
    // SSE-события сериализуются вручную, поэтому camelCase из MVC на них не распространяется.
    // Без этого клиент получал поля ответа в PascalCase, не находил text/id и падал в конце стрима.
    private static readonly JsonSerializerOptions StreamJsonOptions = new(JsonSerializerDefaults.Web);

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
            var response = await _chatService.CreateSessionAsync(userContext, request, GetClientIp());
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
            var result = await _chatService.AddUserMessageAsync(sessionId, userContext, request.Text, GetClientIp());
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    /// <summary>Явная просьба клиента передать диалог специалисту (кнопка в чате).</summary>
    [HttpPost("sessions/{sessionId}/handoff")]
    [AllowAnonymous]
    public async Task<ActionResult<AddChatMessageResponse>> RequestHandoff(
        [FromRoute] string sessionId,
        [FromBody] RequestHandoffRequest request)
    {
        try
        {
            var userContext = User.Identity?.IsAuthenticated == true
                ? SupportUserContext.FromClaims(User)
                : null;
            var result = await _chatService.RequestHandoffAsync(sessionId, userContext, request);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    /// <summary>
    /// Оценка ответа бота. Доступна анонимно, как и сам чат: клиент оценивает свой же диалог,
    /// а идентификатор сессии у него уже есть.
    /// </summary>
    [HttpPost("sessions/{sessionId}/messages/{messageId}/feedback")]
    [AllowAnonymous]
    public async Task<ActionResult<ChatMessageDto>> SetMessageFeedback(
        [FromRoute] string sessionId,
        [FromRoute] string messageId,
        [FromBody] ChatMessageFeedbackRequest request)
    {
        try
        {
            var result = await _chatService.SetMessageFeedbackAsync(sessionId, messageId, request.Feedback);
            return Ok(result);
        }
        catch (SupportChatRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("sessions/{sessionId}/contact")]
    [AllowAnonymous]
    public async Task<ActionResult<ChatSessionDto>> UpdateContact(
        [FromRoute] string sessionId,
        [FromBody] UpdateChatContactRequest request)
    {
        try
        {
            var result = await _chatService.UpdateContactAsync(sessionId, request);
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
                GetClientIp(),
                async chunk =>
                {
                    var payload = JsonSerializer.Serialize(new { text = chunk }, StreamJsonOptions);
                    await Response.WriteAsync($"data: {payload}\n\n", cancellationToken);
                    await Response.Body.FlushAsync(cancellationToken);
                },
                cancellationToken);

            var donePayload = JsonSerializer.Serialize(new { message }, StreamJsonOptions);
            await Response.WriteAsync($"event: done\ndata: {donePayload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
            _streamLogger.LogInformation("Support chat stream finished. SessionId={SessionId}", sessionId);
        }
        catch (SupportChatRequestException ex)
        {
            var errorPayload = JsonSerializer.Serialize(new { error = ex.Message }, StreamJsonOptions);
            await Response.WriteAsync($"event: error\ndata: {errorPayload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
            _streamLogger.LogWarning("Support chat stream failed. SessionId={SessionId} Error={Error}", sessionId, ex.Message);
        }
    }

    private string GetClientIp()
    {
        // Behind Cloudflare the true client IP is in CF-Connecting-IP; behind nginx it's the first
        // entry of X-Forwarded-For. Fall back to the socket address.
        var cfIp = Request.Headers["CF-Connecting-IP"].ToString();
        if (!string.IsNullOrWhiteSpace(cfIp))
        {
            return cfIp.Trim();
        }
        var forwarded = Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            return forwarded.Split(',')[0].Trim();
        }
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
