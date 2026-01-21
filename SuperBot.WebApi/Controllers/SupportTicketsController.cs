using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.WebApi.Support.Dto;
using SuperBot.WebApi.Support.Infrastructure;
using SuperBot.WebApi.Support.Services;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/support")]
[Authorize]
public class SupportTicketsController : ControllerBase
{
    private readonly ISupportTicketService _supportService;
    private readonly SupportRoleEvaluator _roleEvaluator;

    public SupportTicketsController(ISupportTicketService supportService, SupportRoleEvaluator roleEvaluator)
    {
        _supportService = supportService;
        _roleEvaluator = roleEvaluator;
    }

    [HttpGet("tickets")]
    // Response contract example:
    // { items: [{ id, publicId, subject, status, updatedAt, lastMessageAt, lastMessageBy, category }], page, pageSize, total }
    public async Task<ActionResult<SupportTicketListResponse>> GetTickets(
        [FromQuery] string? status,
        [FromQuery] string? q,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? sort = "updatedAt_desc")
    {
        var userContext = SupportUserContext.FromClaims(User);
        var result = await _supportService.ListTicketsAsync(userContext, false, status, q, page, pageSize, sort);
        return Ok(result);
    }

    [HttpPost("tickets")]
    public async Task<ActionResult<CreateSupportTicketResponse>> CreateTicket([FromBody] CreateSupportTicketRequest request)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var result = await _supportService.CreateTicketAsync(userContext, request);
            return Ok(new CreateSupportTicketResponse { Ticket = result.Ticket, FirstMessageId = result.FirstMessageId });
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpGet("tickets/{ticketId}")]
    public async Task<ActionResult<SupportTicketDetailDto>> GetTicketDetails(
        [FromRoute] string ticketId,
        [FromQuery] int messagePage = 1,
        [FromQuery] int messagePageSize = 50)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var isSupportAgent = _roleEvaluator.IsSupportAgent(User);
            var result = await _supportService.GetTicketDetailsAsync(userContext, isSupportAgent, ticketId, messagePage, messagePageSize);
            return Ok(result);
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("tickets/{ticketId}/messages")]
    public async Task<ActionResult<SupportMessageDto>> AddMessage([FromRoute] string ticketId, [FromBody] AddSupportMessageRequest request)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var isSupportAgent = _roleEvaluator.IsSupportAgent(User);
            var message = await _supportService.AddMessageAsync(userContext, isSupportAgent, ticketId, request.Body);
            return Ok(message);
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("tickets/{ticketId}/reopen")]
    public async Task<ActionResult<SupportTicketSummaryDto>> ReopenTicket([FromRoute] string ticketId)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var ticket = await _supportService.ReopenTicketAsync(userContext, ticketId);
            return Ok(ticket);
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpPost("tickets/{ticketId}/attachments")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<IReadOnlyList<SupportAttachmentDto>>> UploadAttachments(
        [FromRoute] string ticketId,
        [FromQuery] string messageId,
        [FromForm] IFormFileCollection files)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(messageId))
            {
                return Problem("messageId is required.", statusCode: StatusCodes.Status400BadRequest);
            }

            var userContext = SupportUserContext.FromClaims(User);
            var isSupportAgent = _roleEvaluator.IsSupportAgent(User);
            var attachments = await _supportService.UploadAttachmentsAsync(userContext, isSupportAgent, ticketId, messageId, files);
            return Ok(attachments);
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }

    [HttpGet("attachments/{attachmentId}/download")]
    public async Task<IActionResult> DownloadAttachment([FromRoute] string attachmentId)
    {
        try
        {
            var userContext = SupportUserContext.FromClaims(User);
            var isSupportAgent = _roleEvaluator.IsSupportAgent(User);
            var (attachment, stream) = await _supportService.DownloadAttachmentAsync(userContext, isSupportAgent, attachmentId);
            return File(stream, attachment.ContentType, attachment.FileName);
        }
        catch (SupportRequestException ex)
        {
            return Problem(ex.Message, statusCode: ex.StatusCode);
        }
    }
}
