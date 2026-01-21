namespace SuperBot.WebApi.Support;

public class SupportOptions
{
    public int AttachmentMaxMb { get; set; } = 10;
    public int MaxAttachmentsPerMessage { get; set; } = 5;
    public int SubjectMaxLength { get; set; } = 120;
    public int DescriptionMaxLength { get; set; } = 2000;
    public int MessageMaxLength { get; set; } = 2000;
    public int ListPageSizeMax { get; set; } = 100;
    public TicketRateLimitOptions TicketRateLimit { get; set; } = new();
    public List<string> AllowedContentTypes { get; set; } = new() { "image/png", "image/jpeg", "application/pdf" };
}

public class TicketRateLimitOptions
{
    public int MaxTickets { get; set; } = 5;
    public int WindowMinutes { get; set; } = 10;
}

public class SupportRoleOptions
{
    public List<string> Roles { get; set; } = new() { "admin", "support" };
}
