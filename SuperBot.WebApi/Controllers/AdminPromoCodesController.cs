using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers;

[ApiController]
[Route("api/admin/promo-codes")]
[Authorize(Roles = "admin")]
public class AdminPromoCodesController : ControllerBase
{
    private readonly IPromoCodeRepository _promoCodeRepository;
    private readonly IPromoCodeUsageRepository _promoCodeUsageRepository;

    public AdminPromoCodesController(IPromoCodeRepository promoCodeRepository, IPromoCodeUsageRepository promoCodeUsageRepository)
    {
        _promoCodeRepository = promoCodeRepository;
        _promoCodeUsageRepository = promoCodeUsageRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var promos = await _promoCodeRepository.GetAllAsync();
        var now = DateTime.UtcNow;
        var response = new List<object>();

        foreach (var promo in promos)
        {
            var used = string.IsNullOrWhiteSpace(promo.Id)
                ? 0
                : await _promoCodeUsageRepository.CountByPromoCodeIdAsync(promo.Id);

            response.Add(MapPromo(promo, used, now));
        }

        return Ok(response);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPromoCodeRequest request)
    {
        var validationError = ValidateRequest(request);
        if (validationError != null)
        {
            return BadRequest(validationError);
        }

        var promoCode = ToEntity(request, null);
        promoCode.CreatedAt = DateTime.UtcNow;

        var created = await _promoCodeRepository.CreateAsync(promoCode);
        var used = await _promoCodeUsageRepository.CountByPromoCodeIdAsync(created.Id!);
        return Ok(MapPromo(created, used, DateTime.UtcNow));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpsertPromoCodeRequest request)
    {
        var existing = await _promoCodeRepository.GetByIdAsync(id);
        if (existing == null)
        {
            return NotFound();
        }

        var validationError = ValidateRequest(request);
        if (validationError != null)
        {
            return BadRequest(validationError);
        }

        var promoCode = ToEntity(request, existing.Id);
        promoCode.CreatedAt = existing.CreatedAt;

        await _promoCodeRepository.UpdateAsync(promoCode);
        var updated = await _promoCodeRepository.GetByIdAsync(id);
        var used = await _promoCodeUsageRepository.CountByPromoCodeIdAsync(id);

        return Ok(MapPromo(updated!, used, DateTime.UtcNow));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        await _promoCodeRepository.DeleteAsync(id);
        return NoContent();
    }

    private static object? ValidateRequest(UpsertPromoCodeRequest request)
    {
        if (request == null)
        {
            return new { message = "Request is required." };
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return new { message = "Code is required." };
        }

        if (request.Value <= 0)
        {
            return new { message = "Value must be greater than zero." };
        }

        if (ParseType(request.Type) == PromoCodeType.Percentage && request.Value > 100)
        {
            return new { message = "Percentage promo value must be <= 100." };
        }

        if (request.EndDate < request.StartDate)
        {
            return new { message = "End date must be later than start date." };
        }

        return null;
    }

    private static PromoCode ToEntity(UpsertPromoCodeRequest request, string? id)
    {
        return new PromoCode
        {
            Id = id,
            Code = request.Code.Trim().ToUpperInvariant(),
            Type = ParseType(request.Type),
            Value = request.Value,
            MinOrderAmount = request.MinOrderAmount,
            MaxDiscountAmount = request.MaxDiscountAmount,
            FirstOrderOnly = request.FirstOrderOnly,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            UsageLimit = request.UsageLimit,
            UsagePerUser = request.UsagePerUser
        };
    }

    private static PromoCodeType ParseType(string type)
    {
        return string.Equals(type, "fixed", StringComparison.OrdinalIgnoreCase)
            ? PromoCodeType.Fixed
            : PromoCodeType.Percentage;
    }

    private static object MapPromo(PromoCode promo, long usedCount, DateTime now)
    {
        var remaining = promo.UsageLimit.HasValue ? Math.Max(0, promo.UsageLimit.Value - (int)usedCount) : (int?)null;
        return new
        {
            id = promo.Id,
            code = promo.Code,
            type = promo.Type == PromoCodeType.Percentage ? "percentage" : "fixed",
            value = promo.Value,
            minOrderAmount = promo.MinOrderAmount,
            maxDiscountAmount = promo.MaxDiscountAmount,
            firstOrderOnly = promo.FirstOrderOnly,
            startDate = promo.StartDate,
            endDate = promo.EndDate,
            usageLimit = promo.UsageLimit,
            usagePerUser = promo.UsagePerUser,
            isActive = promo.IsActiveAt(now),
            createdAt = promo.CreatedAt,
            usedCount,
            remaining
        };
    }
}

public class UpsertPromoCodeRequest
{
    public string Code { get; set; } = string.Empty;
    public string Type { get; set; } = "percentage";
    public decimal Value { get; set; }
    public decimal? MinOrderAmount { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public bool FirstOrderOnly { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? UsageLimit { get; set; }
    public int? UsagePerUser { get; set; }
}
