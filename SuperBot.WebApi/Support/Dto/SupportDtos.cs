using System.ComponentModel.DataAnnotations;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Support.Dto;

public class SupportTicketSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string PublicId { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public SupportTicketStatus Status { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime LastMessageAt { get; set; }
    public SupportAuthorType? LastMessageBy { get; set; }
    // Кому принадлежит тикет — нужно агентам в админ-списке (для владельца это его собственный email).
    public string UserEmail { get; set; } = string.Empty;
}

public class SupportTicketDetailDto
{
    public SupportTicketSummaryDto Ticket { get; set; } = new();
    public IReadOnlyList<SupportMessageDto> Messages { get; set; } = Array.Empty<SupportMessageDto>();
    public int MessagesCount { get; set; }
}

public class SupportMessageDto
{
    public string Id { get; set; } = string.Empty;
    public string TicketId { get; set; } = string.Empty;
    public SupportAuthorType AuthorType { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public IReadOnlyList<SupportAttachmentDto> Attachments { get; set; } = Array.Empty<SupportAttachmentDto>();
}

public class SupportAttachmentDto
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}

public class CreateSupportTicketRequest
{
    [Required]
    public string Category { get; set; } = string.Empty;

    [Required]
    public string Subject { get; set; } = string.Empty;

    [Required]
    public string Description { get; set; } = string.Empty;
}

public class CreateSupportTicketResponse
{
    public SupportTicketSummaryDto Ticket { get; set; } = new();
    public string FirstMessageId { get; set; } = string.Empty;
}

public class AddSupportMessageRequest
{
    [Required]
    public string Body { get; set; } = string.Empty;
}

public class SupportTicketListResponse
{
    public IReadOnlyList<SupportTicketSummaryDto> Items { get; set; } = Array.Empty<SupportTicketSummaryDto>();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public long Total { get; set; }
}
