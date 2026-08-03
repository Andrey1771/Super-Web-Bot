using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Common.Auth;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;

namespace SuperBot.WebApi.Controllers;

/// <summary>Публичные данные программы лояльности — для страницы /rewards.</summary>
[ApiController]
[Route("api/cashback")]
public class CashbackController : ControllerBase
{
    private readonly ICashbackService _cashback;
    private readonly CashbackOptions _options;

    public CashbackController(ICashbackService cashback, CashbackOptions options)
    {
        _cashback = cashback;
        _options = options;
    }

    [AllowAnonymous]
    [HttpGet("tiers")]
    public ActionResult<CashbackTiersResponse> GetTiers()
    {
        return Ok(new CashbackTiersResponse
        {
            Enabled = _cashback.Enabled,
            PointToCurrency = _options.PointToCurrency,
            MinRedeemPoints = _options.MinRedeemPoints,
            MaxRedeemPercentOfOrder = _options.MaxRedeemPercentOfOrder,
            Tiers = _cashback.Tiers.Select(tier => new CashbackTierDto
            {
                Name = tier.Name,
                MinLifetimeSpent = tier.MinLifetimeSpent,
                RatePercent = tier.RatePercent
            }).ToList()
        });
    }
}

/// <summary>Кошелёк текущего пользователя — сводка и история для кабинета.</summary>
[ApiController]
[Route("api/account/cashback")]
[Authorize]
public class AccountCashbackController : ControllerBase
{
    private const int HistoryLimit = 50;

    private readonly ICashbackService _cashback;
    private readonly CashbackOptions _options;

    public AccountCashbackController(ICashbackService cashback, CashbackOptions options)
    {
        _cashback = cashback;
        _options = options;
    }

    [HttpGet]
    public async Task<ActionResult<CashbackAccountResponse>> GetMine()
    {
        // ВАЖНО: тот же ключ, что и у заказов (order.UserId) — иначе кошелёк «не найдётся».
        var userId = User.GetUserKey();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var summary = await _cashback.GetSummaryAsync(userId);
        var history = await _cashback.GetHistoryAsync(userId, HistoryLimit);

        return Ok(new CashbackAccountResponse
        {
            Enabled = summary.Enabled,
            PointToCurrency = _options.PointToCurrency,
            Balance = summary.Balance,
            LifetimeEarned = summary.LifetimeEarned,
            LifetimeSpent = summary.LifetimeSpent,
            ProgressPercent = summary.ProgressPercent,
            CurrentTier = new CashbackTierDto
            {
                Name = summary.CurrentTierName,
                RatePercent = summary.CurrentRatePercent
            },
            NextTier = summary.NextTierName is null ? null : new CashbackNextTierDto
            {
                Name = summary.NextTierName,
                RatePercent = summary.NextTierRatePercent ?? 0m,
                Threshold = summary.NextTierThreshold ?? 0m,
                AmountToNext = summary.AmountToNextTier ?? 0m
            },
            History = history.Select(entry => new CashbackHistoryItem
            {
                Id = entry.Id ?? string.Empty,
                OrderId = entry.OrderId,
                Type = entry.Type.ToString(),
                Amount = entry.Amount,
                BalanceAfter = entry.BalanceAfter,
                Note = entry.Note,
                CreatedAt = entry.CreatedAt.ToUniversalTime().ToString("O")
            }).ToList()
        });
    }
}

public class CashbackTiersResponse
{
    public bool Enabled { get; set; }
    public decimal PointToCurrency { get; set; }
    public int MinRedeemPoints { get; set; }
    public decimal MaxRedeemPercentOfOrder { get; set; }
    public List<CashbackTierDto> Tiers { get; set; } = new();
}

public class CashbackTierDto
{
    public string Name { get; set; } = string.Empty;
    public decimal MinLifetimeSpent { get; set; }
    public decimal RatePercent { get; set; }
}

public class CashbackNextTierDto
{
    public string Name { get; set; } = string.Empty;
    public decimal RatePercent { get; set; }
    public decimal Threshold { get; set; }
    public decimal AmountToNext { get; set; }
}

public class CashbackAccountResponse
{
    public bool Enabled { get; set; }
    public decimal PointToCurrency { get; set; }
    public decimal Balance { get; set; }
    public decimal LifetimeEarned { get; set; }
    public decimal LifetimeSpent { get; set; }
    public decimal ProgressPercent { get; set; }
    public CashbackTierDto CurrentTier { get; set; } = new();
    public CashbackNextTierDto? NextTier { get; set; }
    public List<CashbackHistoryItem> History { get; set; } = new();
}

public class CashbackHistoryItem
{
    public string Id { get; set; } = string.Empty;
    public string? OrderId { get; set; }
    public string Type { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal BalanceAfter { get; set; }
    public string? Note { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}
