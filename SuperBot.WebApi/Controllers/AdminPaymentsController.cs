using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/payments/failures")]
[Authorize(Roles = "admin")]
public class AdminPaymentsController : ControllerBase
{
    private readonly IMongoCollection<PaymentFinalizationFailureDb> _failures;

    public AdminPaymentsController(IMongoDatabase database)
    {
        _failures = database.GetCollection<PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
    }

    [HttpGet]
    public async Task<ActionResult<AdminPaymentFailuresResponse>> GetFailures(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string status = "Open",
        [FromQuery] string search = "")
    {
        var normalizedPage = page < 1 ? 1 : page;
        var normalizedPageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var filter = Builders<PaymentFinalizationFailureDb>.Filter.Empty;

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            filter &= Builders<PaymentFinalizationFailureDb>.Filter.Eq(item => item.Status, status);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var regex = new MongoDB.Bson.BsonRegularExpression(search.Trim(), "i");
            filter &= Builders<PaymentFinalizationFailureDb>.Filter.Or(
                Builders<PaymentFinalizationFailureDb>.Filter.Regex(item => item.PaymentIntentId, regex),
                Builders<PaymentFinalizationFailureDb>.Filter.Regex(item => item.UserId, regex),
                Builders<PaymentFinalizationFailureDb>.Filter.Regex(item => item.ErrorCode, regex)
            );
        }

        var totalItems = await _failures.CountDocumentsAsync(filter);
        var items = await _failures
            .Find(filter)
            .SortByDescending(item => item.LastSeenAt)
            .Skip((normalizedPage - 1) * normalizedPageSize)
            .Limit(normalizedPageSize)
            .ToListAsync();

        return Ok(new AdminPaymentFailuresResponse
        {
            Items = items.Select(MapItem).ToList(),
            Page = normalizedPage,
            PageSize = normalizedPageSize,
            TotalItems = (int)totalItems,
            TotalPages = totalItems == 0 ? 0 : (int)Math.Ceiling(totalItems / (double)normalizedPageSize)
        });
    }

    [HttpGet("{paymentIntentId}")]
    public async Task<ActionResult<AdminPaymentFailureItem>> GetFailure(string paymentIntentId)
    {
        var item = await _failures.Find(failure => failure.PaymentIntentId == paymentIntentId).FirstOrDefaultAsync();
        if (item == null)
        {
            return NotFound();
        }

        return Ok(MapItem(item));
    }

    [HttpPost("{paymentIntentId}/mark-resolved")]
    public async Task<IActionResult> MarkResolved(string paymentIntentId)
    {
        var update = Builders<PaymentFinalizationFailureDb>.Update
            .Set(item => item.Status, "Resolved")
            .Set(item => item.LastSeenAt, DateTime.UtcNow);

        var result = await _failures.UpdateOneAsync(item => item.PaymentIntentId == paymentIntentId, update);
        if (result.MatchedCount == 0)
        {
            return NotFound();
        }

        return NoContent();
    }

    private static AdminPaymentFailureItem MapItem(PaymentFinalizationFailureDb item)
    {
        return new AdminPaymentFailureItem
        {
            PaymentIntentId = item.PaymentIntentId,
            UserId = item.UserId,
            CreatedAt = item.CreatedAt,
            LastSeenAt = item.LastSeenAt,
            Attempts = item.Attempts,
            ErrorCode = item.ErrorCode,
            ErrorMessage = item.ErrorMessage,
            TechnicalDetails = item.TechnicalDetails,
            TraceId = item.TraceId,
            Status = item.Status,
            OrderId = item.OrderId?.ToString()
        };
    }
}

public class AdminPaymentFailuresResponse
{
    public List<AdminPaymentFailureItem> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalItems { get; set; }
    public int TotalPages { get; set; }
}

public class AdminPaymentFailureItem
{
    public string PaymentIntentId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public int Attempts { get; set; }
    public string ErrorCode { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public string? TechnicalDetails { get; set; }
    public string TraceId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? OrderId { get; set; }
}
