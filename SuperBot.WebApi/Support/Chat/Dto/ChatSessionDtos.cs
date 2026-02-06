namespace SuperBot.WebApi.Support.Chat.Dto;

public class CreateChatSessionRequest
{
    public string? Email { get; set; }

    public string? OrderId { get; set; }

    public string? Locale { get; set; }
}

public class CreateChatSessionResponse
{
    public string SessionId { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;
}

public class ChatSessionDto
{
    public string Id { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? AssignedAgentId { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public List<string> Tags { get; set; } = new();

    public string Priority { get; set; } = "normal";
}

public class ChatSessionDetailDto
{
    public ChatSessionDto Session { get; set; } = new();

    public IReadOnlyList<ChatMessageDto> Messages { get; set; } = Array.Empty<ChatMessageDto>();
}

public class ChatSessionListResponse
{
    public IReadOnlyList<ChatSessionSummaryDto> Items { get; set; } = Array.Empty<ChatSessionSummaryDto>();

    public int Page { get; set; }

    public int PageSize { get; set; }

    public long Total { get; set; }
}

public class ChatSessionSummaryDto
{
    public string Id { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? UserId { get; set; }

    public string? Email { get; set; }

    public string? AssignedAgentName { get; set; }

    public DateTime? LastMessageAt { get; set; }

    public string? LastMessagePreview { get; set; }

    public List<string> Tags { get; set; } = new();

    public string Priority { get; set; } = "normal";
}

public class ChatMessageDto
{
    public string Id { get; set; } = string.Empty;

    public string SessionId { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;

    public string AuthorName { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public ChatMessageMetadataDto Metadata { get; set; } = new();
}

public class ChatMessageMetadataDto
{
    public string? Model { get; set; }

    public double? Confidence { get; set; }

    public string? EscalationReason { get; set; }

    public string? ToolCall { get; set; }
}

public class AddChatMessageRequest
{
    public string Text { get; set; } = string.Empty;
}

public class AddChatMessageResponse
{
    public ChatSessionDto Session { get; set; } = new();

    public ChatMessageDto? AssistantMessage { get; set; }
}

public class ChatConfigDto
{
    public bool StreamingEnabled { get; set; }
}

public class ChatAgentMessageRequest
{
    public string Text { get; set; } = string.Empty;
}

public class UpdateChatSessionRequest
{
    public string? Status { get; set; }

    public string? Priority { get; set; }

    public string? Tag { get; set; }
}
