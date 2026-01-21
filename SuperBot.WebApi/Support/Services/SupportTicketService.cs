using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.GridFS;
using SuperBot.WebApi.Support.Dto;
using SuperBot.WebApi.Support.Infrastructure;
using SuperBot.WebApi.Support.Models;

namespace SuperBot.WebApi.Support.Services;

public class SupportTicketService : ISupportTicketService
{
    private readonly IMongoCollection<SupportTicket> _tickets;
    private readonly IMongoCollection<SupportMessage> _messages;
    private readonly IMongoCollection<SupportAttachment> _attachments;
    private readonly IMongoCollection<SupportTicketCounter> _counters;
    private readonly GridFSBucket _gridFs;
    private readonly SupportOptions _options;
    private readonly IMemoryCache _cache;
    public SupportTicketService(
        IMongoDatabase database,
        IOptions<SupportOptions> options,
        IMemoryCache cache)
    {
        _tickets = database.GetCollection<SupportTicket>("SupportTickets");
        _messages = database.GetCollection<SupportMessage>("SupportMessages");
        _attachments = database.GetCollection<SupportAttachment>("SupportAttachments");
        _counters = database.GetCollection<SupportTicketCounter>("SupportTicketCounters");
        _gridFs = new GridFSBucket(database, new GridFSBucketOptions { BucketName = "SupportAttachments" });
        _options = options.Value;
        _cache = cache;
    }

    public async Task<SupportTicketListResponse> ListTicketsAsync(
        SupportUserContext user,
        bool isSupportAgent,
        string? status,
        string? query,
        int page,
        int pageSize,
        string? sort)
    {
        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, _options.ListPageSizeMax);

        var filterBuilder = Builders<SupportTicket>.Filter;
        var filter = isSupportAgent
            ? filterBuilder.Empty
            : filterBuilder.Eq(ticket => ticket.UserId, user.UserId);

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<SupportTicketStatus>(status, true, out var parsed))
        {
            filter &= filterBuilder.Eq(ticket => ticket.Status, parsed);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var regex = new BsonRegularExpression(query, "i");
            filter &= filterBuilder.Or(
                filterBuilder.Regex(ticket => ticket.Subject, regex),
                filterBuilder.Regex(ticket => ticket.PublicId, regex),
                filterBuilder.Regex(ticket => ticket.Category, regex));
        }

        var sortDefinition = BuildSort(sort);
        var total = await _tickets.CountDocumentsAsync(filter);

        var items = await _tickets
            .Find(filter)
            .Sort(sortDefinition)
            .Skip((safePage - 1) * safePageSize)
            .Limit(safePageSize)
            .ToListAsync();

        return new SupportTicketListResponse
        {
            Items = items.Select(MapSummary).ToList(),
            Page = safePage,
            PageSize = safePageSize,
            Total = total
        };
    }

    public async Task<(SupportTicketSummaryDto Ticket, string FirstMessageId)> CreateTicketAsync(SupportUserContext user, CreateSupportTicketRequest request)
    {
        EnsureRateLimit(user.UserId);
        ValidateText(request.Subject, _options.SubjectMaxLength, "Subject");
        ValidateText(request.Description, _options.DescriptionMaxLength, "Description");
        if (string.IsNullOrWhiteSpace(request.Category))
        {
            throw new SupportRequestException("Category is required.", StatusCodes.Status400BadRequest);
        }

        var now = DateTime.UtcNow;
        var publicId = await GeneratePublicIdAsync();

        var ticket = new SupportTicket
        {
            PublicId = publicId,
            UserId = user.UserId,
            UserEmail = user.Email,
            Subject = request.Subject.Trim(),
            Category = request.Category.Trim(),
            Status = SupportTicketStatus.Open,
            CreatedAt = now,
            UpdatedAt = now,
            LastMessageAt = now,
            LastMessageBy = SupportAuthorType.User,
            AttachmentsCount = 0,
            MessagesCount = 1
        };

        await _tickets.InsertOneAsync(ticket);

        var message = new SupportMessage
        {
            TicketId = ticket.Id,
            AuthorType = SupportAuthorType.User,
            AuthorId = user.UserId,
            AuthorName = user.DisplayName,
            Body = SanitizeBody(request.Description),
            CreatedAt = now
        };

        await _messages.InsertOneAsync(message);

        return (MapSummary(ticket), message.Id);
    }

    public async Task<SupportTicketDetailDto> GetTicketDetailsAsync(
        SupportUserContext user,
        bool isSupportAgent,
        string ticketId,
        int messagePage,
        int messagePageSize)
    {
        var ticket = await FindTicketAsync(ticketId);
        EnsureAccess(ticket, user, isSupportAgent);

        var safePage = Math.Max(messagePage, 1);
        var safePageSize = Math.Clamp(messagePageSize, 1, _options.ListPageSizeMax);
        var filter = Builders<SupportMessage>.Filter.Eq(message => message.TicketId, ticket.Id);
        var total = await _messages.CountDocumentsAsync(filter);

        var items = await _messages
            .Find(filter)
            .SortBy(message => message.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Limit(safePageSize)
            .ToListAsync();

        return new SupportTicketDetailDto
        {
            Ticket = MapSummary(ticket),
            Messages = items.Select(MapMessage).ToList(),
            MessagesCount = (int)total
        };
    }

    public async Task<SupportMessageDto> AddMessageAsync(SupportUserContext user, bool isSupportAgent, string ticketId, string body)
    {
        ValidateText(body, _options.MessageMaxLength, "Message");

        var ticket = await FindTicketAsync(ticketId);
        EnsureAccess(ticket, user, isSupportAgent);

        if (!isSupportAgent && (ticket.Status == SupportTicketStatus.Resolved || ticket.Status == SupportTicketStatus.Closed))
        {
            throw new SupportRequestException("Ticket is closed. Reopen to reply.", StatusCodes.Status409Conflict);
        }

        var now = DateTime.UtcNow;
        var authorType = isSupportAgent ? SupportAuthorType.Support : SupportAuthorType.User;

        var message = new SupportMessage
        {
            TicketId = ticket.Id,
            AuthorType = authorType,
            AuthorId = user.UserId,
            AuthorName = user.DisplayName,
            Body = SanitizeBody(body),
            CreatedAt = now
        };

        await _messages.InsertOneAsync(message);

        var nextStatus = isSupportAgent ? SupportTicketStatus.WaitingForUser : SupportTicketStatus.WaitingForSupport;
        var update = Builders<SupportTicket>.Update
            .Set(t => t.Status, nextStatus)
            .Set(t => t.UpdatedAt, now)
            .Set(t => t.LastMessageAt, now)
            .Set(t => t.LastMessageBy, authorType)
            .Inc(t => t.MessagesCount, 1);

        await _tickets.UpdateOneAsync(t => t.Id == ticket.Id, update);

        ticket.Status = nextStatus;
        ticket.UpdatedAt = now;
        ticket.LastMessageAt = now;
        ticket.LastMessageBy = authorType;
        ticket.MessagesCount += 1;

        return MapMessage(message);
    }

    public async Task<SupportTicketSummaryDto> ReopenTicketAsync(SupportUserContext user, string ticketId)
    {
        var ticket = await FindTicketAsync(ticketId);
        EnsureAccess(ticket, user, false);

        if (ticket.Status != SupportTicketStatus.Resolved && ticket.Status != SupportTicketStatus.Closed)
        {
            return MapSummary(ticket);
        }

        var now = DateTime.UtcNow;
        var update = Builders<SupportTicket>.Update
            .Set(t => t.Status, SupportTicketStatus.Open)
            .Set(t => t.UpdatedAt, now)
            .Set(t => t.LastMessageAt, now)
            .Set(t => t.LastMessageBy, SupportAuthorType.System)
            .Inc(t => t.MessagesCount, 1);

        await _tickets.UpdateOneAsync(t => t.Id == ticket.Id, update);

        var systemMessage = new SupportMessage
        {
            TicketId = ticket.Id,
            AuthorType = SupportAuthorType.System,
            AuthorId = user.UserId,
            AuthorName = "System",
            Body = "Ticket reopened by user.",
            CreatedAt = now
        };

        await _messages.InsertOneAsync(systemMessage);

        ticket.Status = SupportTicketStatus.Open;
        ticket.UpdatedAt = now;
        ticket.LastMessageAt = now;
        ticket.LastMessageBy = SupportAuthorType.System;
        ticket.MessagesCount += 1;

        return MapSummary(ticket);
    }

    public async Task<SupportTicketSummaryDto> ResolveTicketAsync(SupportUserContext user, string ticketId)
    {
        return await SetStatusAsync(user, ticketId, SupportTicketStatus.Resolved, "Ticket marked as resolved.");
    }

    public async Task<SupportTicketSummaryDto> CloseTicketAsync(SupportUserContext user, string ticketId)
    {
        return await SetStatusAsync(user, ticketId, SupportTicketStatus.Closed, "Ticket closed by support.");
    }

    public async Task<IReadOnlyList<SupportAttachmentDto>> UploadAttachmentsAsync(
        SupportUserContext user,
        bool isSupportAgent,
        string ticketId,
        string messageId,
        IFormFileCollection files)
    {
        if (files.Count == 0)
        {
            throw new SupportRequestException("No files uploaded.", StatusCodes.Status400BadRequest);
        }

        var ticket = await FindTicketAsync(ticketId);
        EnsureAccess(ticket, user, isSupportAgent);

        if (!isSupportAgent && (ticket.Status == SupportTicketStatus.Resolved || ticket.Status == SupportTicketStatus.Closed))
        {
            throw new SupportRequestException("Ticket is closed. Reopen to add attachments.", StatusCodes.Status409Conflict);
        }

        var message = await _messages.Find(m => m.Id == messageId && m.TicketId == ticket.Id).FirstOrDefaultAsync();
        if (message == null)
        {
            throw new SupportRequestException("Message not found.", StatusCodes.Status404NotFound);
        }

        if (!isSupportAgent && !string.Equals(message.AuthorId, user.UserId, StringComparison.OrdinalIgnoreCase))
        {
            throw new SupportRequestException("You can only attach files to your own messages.", StatusCodes.Status403Forbidden);
        }

        var existingCount = message.Attachments?.Count ?? 0;
        if (existingCount + files.Count > _options.MaxAttachmentsPerMessage)
        {
            throw new SupportRequestException($"Max {_options.MaxAttachmentsPerMessage} files per message.", StatusCodes.Status400BadRequest);
        }

        var createdAt = DateTime.UtcNow;
        var attachmentDtos = new List<SupportAttachmentDto>();

        foreach (var file in files)
        {
            if (!_options.AllowedContentTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            {
                throw new SupportRequestException("Unsupported file type.", StatusCodes.Status400BadRequest);
            }

            var maxBytes = _options.AttachmentMaxMb * 1024L * 1024L;
            if (file.Length > maxBytes)
            {
                throw new SupportRequestException($"File exceeds {_options.AttachmentMaxMb}MB limit.", StatusCodes.Status400BadRequest);
            }

            await using var stream = file.OpenReadStream();
            var uploadOptions = new GridFSUploadOptions
            {
                Metadata = new BsonDocument
                {
                    { "contentType", file.ContentType },
                    { "fileName", file.FileName }
                }
            };

            var storageId = await _gridFs.UploadFromStreamAsync(file.FileName, stream, uploadOptions);

            var attachment = new SupportAttachment
            {
                TicketId = ticket.Id,
                MessageId = message.Id,
                UploadedByUserId = user.UserId,
                FileName = file.FileName,
                ContentType = file.ContentType,
                SizeBytes = file.Length,
                StorageId = storageId.ToString(),
                CreatedAt = createdAt
            };

            await _attachments.InsertOneAsync(attachment);

            var info = new SupportAttachmentInfo
            {
                Id = attachment.Id,
                FileName = attachment.FileName,
                ContentType = attachment.ContentType,
                SizeBytes = attachment.SizeBytes
            };

            var update = Builders<SupportMessage>.Update.Push(m => m.Attachments, info);
            await _messages.UpdateOneAsync(m => m.Id == message.Id, update);

            attachmentDtos.Add(new SupportAttachmentDto
            {
                Id = attachment.Id,
                FileName = attachment.FileName,
                ContentType = attachment.ContentType,
                SizeBytes = attachment.SizeBytes
            });
        }

        if (attachmentDtos.Count > 0)
        {
            var updateTicket = Builders<SupportTicket>.Update
                .Inc(t => t.AttachmentsCount, attachmentDtos.Count)
                .Set(t => t.UpdatedAt, createdAt);
            await _tickets.UpdateOneAsync(t => t.Id == ticket.Id, updateTicket);
        }

        return attachmentDtos;
    }

    public async Task<(SupportAttachment attachment, Stream contentStream)> DownloadAttachmentAsync(
        SupportUserContext user,
        bool isSupportAgent,
        string attachmentId)
    {
        var attachment = await _attachments.Find(a => a.Id == attachmentId).FirstOrDefaultAsync();
        if (attachment == null)
        {
            throw new SupportRequestException("Attachment not found.", StatusCodes.Status404NotFound);
        }

        var ticket = await _tickets.Find(t => t.Id == attachment.TicketId).FirstOrDefaultAsync();
        if (ticket == null)
        {
            throw new SupportRequestException("Ticket not found.", StatusCodes.Status404NotFound);
        }

        EnsureAccess(ticket, user, isSupportAgent);

        var stream = await _gridFs.OpenDownloadStreamAsync(new ObjectId(attachment.StorageId));
        return (attachment, stream);
    }

    private async Task<SupportTicket> FindTicketAsync(string ticketId)
    {
        SupportTicket? ticket = null;
        if (ObjectId.TryParse(ticketId, out _))
        {
            ticket = await _tickets.Find(t => t.Id == ticketId).FirstOrDefaultAsync();
        }

        if (ticket == null)
        {
            ticket = await _tickets.Find(t => t.PublicId == ticketId).FirstOrDefaultAsync();
        }

        if (ticket == null)
        {
            throw new SupportRequestException("Ticket not found.", StatusCodes.Status404NotFound);
        }

        return ticket;
    }

    private async Task<string> GeneratePublicIdAsync()
    {
        var update = Builders<SupportTicketCounter>.Update.Inc(counter => counter.Seq, 1);
        var options = new FindOneAndUpdateOptions<SupportTicketCounter>
        {
            IsUpsert = true,
            ReturnDocument = ReturnDocument.After
        };

        var counter = await _counters.FindOneAndUpdateAsync(counter => counter.Id == "support_ticket", update, options);
        return $"TKT-{counter.Seq:00000}";
    }

    private void EnsureAccess(SupportTicket ticket, SupportUserContext user, bool isSupportAgent)
    {
        if (!isSupportAgent && !string.Equals(ticket.UserId, user.UserId, StringComparison.OrdinalIgnoreCase))
        {
            throw new SupportRequestException("Access denied.", StatusCodes.Status403Forbidden);
        }
    }

    private void ValidateText(string value, int maxLength, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new SupportRequestException($"{fieldName} is required.", StatusCodes.Status400BadRequest);
        }

        if (value.Length > maxLength)
        {
            throw new SupportRequestException($"{fieldName} exceeds {maxLength} characters.", StatusCodes.Status400BadRequest);
        }
    }

    private void EnsureRateLimit(string userId)
    {
        var key = $"support_ticket_rate_{userId}";
        if (_cache.TryGetValue<int>(key, out var count))
        {
            if (count >= _options.TicketRateLimit.MaxTickets)
            {
                throw new SupportRequestException("Ticket creation limit reached. Please wait and try again.", StatusCodes.Status429TooManyRequests);
            }

            _cache.Set(key, count + 1, TimeSpan.FromMinutes(_options.TicketRateLimit.WindowMinutes));
            return;
        }

        _cache.Set(key, 1, TimeSpan.FromMinutes(_options.TicketRateLimit.WindowMinutes));
    }

    private SupportTicketSummaryDto MapSummary(SupportTicket ticket)
    {
        return new SupportTicketSummaryDto
        {
            Id = ticket.Id,
            PublicId = ticket.PublicId,
            Subject = ticket.Subject,
            Category = ticket.Category,
            Status = ticket.Status,
            UpdatedAt = ticket.UpdatedAt,
            LastMessageAt = ticket.LastMessageAt,
            LastMessageBy = ticket.LastMessageBy
        };
    }

    private SupportMessageDto MapMessage(SupportMessage message)
    {
        return new SupportMessageDto
        {
            Id = message.Id,
            TicketId = message.TicketId,
            AuthorType = message.AuthorType,
            AuthorName = message.AuthorName,
            Body = message.Body,
            CreatedAt = message.CreatedAt,
            Attachments = message.Attachments.Select(a => new SupportAttachmentDto
            {
                Id = a.Id,
                FileName = a.FileName,
                ContentType = a.ContentType,
                SizeBytes = a.SizeBytes
            }).ToList()
        };
    }

    private async Task<SupportTicketSummaryDto> SetStatusAsync(SupportUserContext user, string ticketId, SupportTicketStatus status, string systemMessage)
    {
        var ticket = await FindTicketAsync(ticketId);
        EnsureAccess(ticket, user, true);

        if (ticket.Status == status)
        {
            return MapSummary(ticket);
        }

        var now = DateTime.UtcNow;
        var update = Builders<SupportTicket>.Update
            .Set(t => t.Status, status)
            .Set(t => t.UpdatedAt, now)
            .Set(t => t.LastMessageAt, now)
            .Set(t => t.LastMessageBy, SupportAuthorType.System)
            .Inc(t => t.MessagesCount, 1);

        await _tickets.UpdateOneAsync(t => t.Id == ticket.Id, update);

        var message = new SupportMessage
        {
            TicketId = ticket.Id,
            AuthorType = SupportAuthorType.System,
            AuthorId = user.UserId,
            AuthorName = "System",
            Body = systemMessage,
            CreatedAt = now
        };

        await _messages.InsertOneAsync(message);

        ticket.Status = status;
        ticket.UpdatedAt = now;
        ticket.LastMessageAt = now;
        ticket.LastMessageBy = SupportAuthorType.System;
        ticket.MessagesCount += 1;

        return MapSummary(ticket);
    }

    private SortDefinition<SupportTicket> BuildSort(string? sort)
    {
        return sort?.ToLowerInvariant() switch
        {
            "updatedat_asc" => Builders<SupportTicket>.Sort.Ascending(t => t.UpdatedAt),
            "createdat_desc" => Builders<SupportTicket>.Sort.Descending(t => t.CreatedAt),
            "createdat_asc" => Builders<SupportTicket>.Sort.Ascending(t => t.CreatedAt),
            _ => Builders<SupportTicket>.Sort.Descending(t => t.UpdatedAt)
        };
    }

    private string SanitizeBody(string body)
    {
        return body.Trim();
    }
}

public class SupportRequestException : Exception
{
    public int StatusCode { get; }

    public SupportRequestException(string message, int statusCode) : base(message)
    {
        StatusCode = statusCode;
    }
}
