using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Common.Auth;
using SuperBot.Core.Cashback;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Кэшбэк для витрины и кабинета. Баланс хранится в долларах; здесь он пересчитывается в валюту,
/// которую покупатель выбрал на сайте. Нет курса для валюты — отдаём в долларах и честно
/// называем валюту ответа, чтобы фронтенд не подписал доллары как евро.
/// </summary>
[ApiController]
public class CashbackController : ControllerBase
{
    /// <summary>Историю отдаём целиком: записей у покупателя немного, а фильтры и поиск — на клиенте.</summary>
    private const int MaxHistory = 500;

    private readonly ICashbackLedger _ledger;
    private readonly ICashbackCurrency _currency;
    private readonly IOptionsMonitor<CashbackOptions> _options;
    private readonly StorefrontCurrencyOptions _currencies;

    public CashbackController(
        ICashbackLedger ledger,
        ICashbackCurrency currency,
        IOptionsMonitor<CashbackOptions> options,
        IOptions<StorefrontCurrencyOptions> currencies)
    {
        _ledger = ledger;
        _currency = currency;
        _options = options;
        _currencies = currencies.Value;
    }

    /// <summary>Условия программы: уровни, сроки. Публично — нужно странице /rewards и гостю в корзине.</summary>
    [AllowAnonymous]
    [HttpGet("api/cashback/program")]
    public ActionResult<CashbackProgramResponse> GetProgram([FromQuery] string? currency = null)
    {
        var options = _options.CurrentValue;
        var money = MoneyIn(currency);
        return Ok(new CashbackProgramResponse
        {
            Enabled = options.Enabled,
            Currency = money.Currency,
            PendingDays = options.PendingDays,
            ExpiryMonths = options.ExpiryMonths,
            MinCardPayment = money.Convert(options.MinCardPaymentUsd),
            EmailNotices = options.EmailNotices,
            ExpiryReminderDays = options.EmailNotices ? options.ExpiryReminderDays : 0,
            Tiers = options.EffectiveTiers.Select(tier => new CashbackTierResponse
            {
                Id = tier.Id,
                Name = tier.Name,
                Percent = tier.Percent,
                SpendThreshold = tier.SpendThresholdUsd > 0 ? money.Convert(tier.SpendThresholdUsd) : null,
                ImageUrl = tier.ImageUrl
            }).ToList()
        });
    }

    /// <summary>Баланс, уровень и история текущего покупателя.</summary>
    [Authorize]
    [HttpGet("api/account/cashback")]
    public async Task<ActionResult<AccountCashbackResponse>> GetAccountCashback([FromQuery] string? currency = null)
    {
        var userKey = User.GetUserKey();
        if (string.IsNullOrWhiteSpace(userKey))
        {
            return Unauthorized();
        }

        var options = _options.CurrentValue;
        var money = MoneyIn(currency);
        var entries = await _ledger.GetEntriesAsync(userKey);
        var summary = CashbackProjection.Project(entries, DateTime.UtcNow);
        var tier = options.TierFor(summary.QualifyingSpendUsd);
        var next = options.EffectiveTiers.FirstOrDefault(item => item.SpendThresholdUsd > tier.SpendThresholdUsd);

        return Ok(new AccountCashbackResponse
        {
            Enabled = options.Enabled,
            Currency = money.Currency,
            Available = money.Convert(summary.AvailableUsd),
            Pending = money.Convert(summary.PendingUsd),
            Reserved = money.Convert(summary.ReservedUsd),
            NextUnlockAt = summary.NextUnlockAt,
            EarnedAllTime = money.Convert(summary.EarnedAllTimeUsd),
            UsedAllTime = money.Convert(summary.UsedAllTimeUsd),
            TotalSpent = money.Convert(summary.QualifyingSpendUsd),
            Tier = new CashbackTierResponse { Id = tier.Id, Name = tier.Name, Percent = tier.Percent, ImageUrl = tier.ImageUrl },
            NextTier = next == null ? null : new CashbackTierResponse
            {
                Id = next.Id,
                Name = next.Name,
                Percent = next.Percent,
                SpendThreshold = money.Convert(next.SpendThresholdUsd),
                ImageUrl = next.ImageUrl
            },
            RemainingToNextTier = next == null ? null : money.Convert(Math.Max(0, next.SpendThresholdUsd - summary.QualifyingSpendUsd)),
            // Доля пути от порога текущего уровня до следующего, а не от нуля: только что перешедший
            // на Veteran не должен видеть «20% пути», пройдя ноль нового.
            Progress = next == null
                ? 1m
                : Math.Clamp((summary.QualifyingSpendUsd - tier.SpendThresholdUsd) / (next.SpendThresholdUsd - tier.SpendThresholdUsd), 0m, 1m),
            Tiers = options.EffectiveTiers.Select(item => new CashbackTierResponse
            {
                Id = item.Id,
                Name = item.Name,
                Percent = item.Percent,
                SpendThreshold = item.SpendThresholdUsd > 0 ? money.Convert(item.SpendThresholdUsd) : null,
                ImageUrl = item.ImageUrl
            }).ToList(),
            History = entries
                .Select(entry => ToHistoryRow(entry, summary, money))
                .Where(row => row != null)
                .Take(MaxHistory)
                .ToList()!
        });
    }

    private static CashbackHistoryRow? ToHistoryRow(CashbackEntry entry, CashbackSummary summary, Money money)
    {
        var row = new CashbackHistoryRow
        {
            Id = entry.Id ?? entry.IdempotencyKey,
            Type = entry.Type,
            OrderNumber = entry.OrderNumber,
            GameTitle = entry.GameTitle,
            ImagePath = entry.GameCoverUrl,
            Date = entry.CreatedAt,
            OrderTotal = entry.OrderTotal,
            OrderCurrency = entry.OrderCurrency,
            Percent = entry.Percent,
            Note = entry.Note
        };

        switch (entry.Type)
        {
            case CashbackEntryTypes.Earn:
                var state = entry.Id != null && summary.Earns.TryGetValue(entry.Id, out var earn) ? earn.State : "pending";
                row.Amount = money.Convert(entry.AmountUsd);
                row.Status = state;
                row.UnlocksAt = state == "pending" ? entry.UnlocksAt : null;
                return row;
            case CashbackEntryTypes.Reversal:
                row.Amount = -money.Convert(entry.AmountUsd);
                row.Status = "reverted";
                row.OrderTotal = null;
                return row;
            case CashbackEntryTypes.Spend when entry.Status == CashbackSpendStatuses.Committed:
                row.Amount = -money.Convert(entry.AmountUsd);
                row.Status = "spent";
                return row;
            case CashbackEntryTypes.Return:
                row.Amount = money.Convert(entry.AmountUsd);
                row.Status = "returned";
                return row;
            case CashbackEntryTypes.Adjust:
                row.Amount = money.Convert(entry.AmountUsd);
                row.Status = "adjusted";
                return row;
            default:
                // Резервы под ещё не прошедшие платежи и снятые резервы в историю не попадают.
                return null;
        }
    }

    private Money MoneyIn(string? requested)
    {
        var currency = _currencies.Resolve(requested);
        return _currency.FromUsd(1m, currency) == null
            ? new Money("USD", usd => CashbackProjection.Round(usd))
            : new Money(currency, usd => _currency.FromUsd(usd, currency) ?? usd);
    }

    private sealed record Money(string Currency, Func<decimal, decimal> Convert);
}

public class CashbackProgramResponse
{
    public bool Enabled { get; set; }
    public string Currency { get; set; } = "USD";
    public int PendingDays { get; set; }
    public int ExpiryMonths { get; set; }
    public decimal MinCardPayment { get; set; }
    /// <summary>Шлём ли письма «кэшбэк доступен» и «скоро сгорит» — условия программы говорят об этом покупателю.</summary>
    public bool EmailNotices { get; set; }
    /// <summary>За сколько дней до сгорания напоминаем; 0 — не напоминаем (или письма выключены).</summary>
    public int ExpiryReminderDays { get; set; }
    public List<CashbackTierResponse> Tiers { get; set; } = new();
}

public class CashbackTierResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Percent { get; set; }
    /// <summary>С какой суммы покупок открывается; null — с первого заказа.</summary>
    public decimal? SpendThreshold { get; set; }
    /// <summary>Картинка уровня из медиатеки; null — витрина берёт встроенную медаль.</summary>
    public string? ImageUrl { get; set; }
}

public class AccountCashbackResponse
{
    public bool Enabled { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal Available { get; set; }
    public decimal Pending { get; set; }
    public decimal Reserved { get; set; }
    public DateTime? NextUnlockAt { get; set; }
    public decimal EarnedAllTime { get; set; }
    public decimal UsedAllTime { get; set; }
    public decimal TotalSpent { get; set; }
    public CashbackTierResponse Tier { get; set; } = new();
    public CashbackTierResponse? NextTier { get; set; }
    public decimal? RemainingToNextTier { get; set; }
    /// <summary>0…1 — пройденная доля пути до следующего уровня; на верхнем — 1.</summary>
    public decimal Progress { get; set; }
    /// <summary>Все уровни с порогами в валюте ответа.</summary>
    public List<CashbackTierResponse> Tiers { get; set; } = new();
    public List<CashbackHistoryRow> History { get; set; } = new();
}

public class CashbackHistoryRow
{
    public string Id { get; set; } = string.Empty;
    /// <summary>earn | reversal | spend | return | adjust.</summary>
    public string Type { get; set; } = string.Empty;
    public string? OrderNumber { get; set; }
    public string? GameTitle { get; set; }
    public string? ImagePath { get; set; }
    public DateTime Date { get; set; }
    /// <summary>Сумма заказа в его собственной валюте (<see cref="OrderCurrency"/>).</summary>
    public decimal? OrderTotal { get; set; }
    public string? OrderCurrency { get; set; }
    public decimal? Percent { get; set; }
    /// <summary>В валюте ответа: плюс — пришло на баланс, минус — ушло.</summary>
    public decimal Amount { get; set; }
    /// <summary>pending | available | spent | expired | reverted | returned | adjusted.</summary>
    public string Status { get; set; } = string.Empty;
    public DateTime? UnlocksAt { get; set; }
    public string? Note { get; set; }
}
