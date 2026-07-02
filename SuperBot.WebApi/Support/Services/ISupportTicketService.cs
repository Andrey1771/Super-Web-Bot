using Microsoft.AspNetCore.Http;
using SuperBot.WebApi.Support.Dto;
using SuperBot.WebApi.Support.Infrastructure;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Support.Services;

public interface ISupportTicketService
{
    Task<SupportTicketListResponse> ListTicketsAsync(SupportUserContext user, bool isSupportAgent, string? status, string? query, int page, int pageSize, string? sort);
    Task<(SupportTicketSummaryDto Ticket, string FirstMessageId)> CreateTicketAsync(SupportUserContext user, CreateSupportTicketRequest request);
    Task<SupportTicketDetailDto> GetTicketDetailsAsync(SupportUserContext user, bool isSupportAgent, string ticketId, int messagePage, int messagePageSize);
    Task<SupportMessageDto> AddMessageAsync(SupportUserContext user, bool isSupportAgent, string ticketId, string body);
    Task<SupportTicketSummaryDto> ReopenTicketAsync(SupportUserContext user, string ticketId);
    Task<SupportTicketSummaryDto> ResolveTicketAsync(SupportUserContext user, string ticketId);
    Task<SupportTicketSummaryDto> ResolveTicketAsOwnerAsync(SupportUserContext user, string ticketId);
    Task<SupportTicketSummaryDto> CloseTicketAsync(SupportUserContext user, string ticketId);
    Task<IReadOnlyList<SupportAttachmentDto>> UploadAttachmentsAsync(SupportUserContext user, bool isSupportAgent, string ticketId, string messageId, IFormFileCollection files);
    Task<(SupportAttachment attachment, Stream contentStream)> DownloadAttachmentAsync(SupportUserContext user, bool isSupportAgent, string attachmentId);
}
