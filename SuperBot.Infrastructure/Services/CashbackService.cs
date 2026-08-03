using Microsoft.Extensions.Logging;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Services;

/// <summary>
/// Программа лояльности. Начисление идёт из финализации заказа (best-effort, не роняет оплату),
/// откат — из сверки платежей при возврате/чарджбеке. Идемпотентность — на уникальном индексе
/// (OrderId, Type) в леджере: повторный вызов по тому же заказу ничего не двигает.
/// </summary>
public class CashbackService : ICashbackService
{
    private readonly ICashbackAccountRepository _accounts;
    private readonly ICashbackTransactionRepository _transactions;
    private readonly IOrderRepository _orders;
    private readonly CashbackOptions _options;
    private readonly ILogger<CashbackService> _logger;

    public CashbackService(
        ICashbackAccountRepository accounts,
        ICashbackTransactionRepository transactions,
        IOrderRepository orders,
        CashbackOptions options,
        ILogger<CashbackService> logger)
    {
        _accounts = accounts;
        _transactions = transactions;
        _orders = orders;
        _options = options;
        _logger = logger;
    }

    public bool Enabled => _options.Enabled;

    public IReadOnlyList<CashbackTier> Tiers => _options.Tiers;

    public async Task AccrueForOrderAsync(Order order)
    {
        if (!_options.Enabled)
        {
            return;
        }

        var userId = order.UserId;
        var orderId = order.Id.ToString();
        var spent = order.TotalAmount ?? order.Totals?.Total ?? 0m;
        if (string.IsNullOrWhiteSpace(userId) || spent <= 0m)
        {
            return;
        }

        // Ставка — по тиру от суммы трат ДО этого заказа.
        var existing = await _accounts.GetByUserIdAsync(userId);
        var lifetimeSpentBefore = existing?.LifetimeSpent ?? 0m;
        var tier = _options.ResolveTier(lifetimeSpentBefore);

        var points = Round(spent * (tier.RatePercent / 100m) / _options.PointToCurrency);
        if (points <= 0m)
        {
            // Сумму трат всё равно засчитываем в тир, даже если кэшбэк округлился в ноль.
            await _accounts.IncrementAsync(userId, 0m, 0m, spent);
            return;
        }

        var transaction = new CashbackTransaction
        {
            UserId = userId,
            OrderId = orderId,
            Type = CashbackTransactionType.Earn,
            Amount = points,
            Note = $"Cashback {tier.RatePercent:0.##}% ({tier.Name})",
            CreatedAt = DateTime.UtcNow
        };

        if (!await _transactions.TryInsertAsync(transaction))
        {
            // Уже начислено по этому заказу — идемпотентный no-op.
            return;
        }

        var updated = await _accounts.IncrementAsync(userId, points, points, spent);
        await _transactions.SetBalanceAfterAsync(transaction.Id!, updated.Balance);

        _logger.LogInformation("Cashback accrued: {Points} pts to {UserId} for order {OrderId} (tier {Tier}).",
            points, userId, orderId, tier.Name);
    }

    public async Task ReverseForOrderAsync(string orderId)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(orderId))
        {
            return;
        }

        var earn = await _transactions.GetByOrderAndTypeAsync(orderId, CashbackTransactionType.Earn);
        if (earn is null || earn.Amount <= 0m)
        {
            return; // по заказу ничего не начислялось — откатывать нечего
        }

        var reverse = new CashbackTransaction
        {
            UserId = earn.UserId,
            OrderId = orderId,
            Type = CashbackTransactionType.Reverse,
            Amount = earn.Amount,
            Note = "Reversed after refund/chargeback",
            CreatedAt = DateTime.UtcNow
        };

        if (!await _transactions.TryInsertAsync(reverse))
        {
            return; // уже откачено
        }

        // Списываем начисленное и снимаем траты заказа из тир-счётчика.
        var order = await _orders.GetOrderByIdAsync(orderId);
        var spent = order?.TotalAmount ?? order?.Totals?.Total ?? 0m;

        var updated = await _accounts.IncrementAsync(earn.UserId, -earn.Amount, -earn.Amount, -spent);

        // Баланс не уводим в минус: часть начисленного могла быть уже потрачена.
        var balanceAfter = updated.Balance;
        if (balanceAfter < 0m)
        {
            await _accounts.SetBalanceAsync(earn.UserId, 0m);
            balanceAfter = 0m;
        }

        await _transactions.SetBalanceAfterAsync(reverse.Id!, balanceAfter);

        _logger.LogInformation("Cashback reversed: {Points} pts from {UserId} for order {OrderId}.",
            earn.Amount, earn.UserId, orderId);
    }

    public async Task<CashbackSummary> GetSummaryAsync(string userId)
    {
        var account = await _accounts.GetByUserIdAsync(userId);
        var balance = account?.Balance ?? 0m;
        var lifetimeEarned = account?.LifetimeEarned ?? 0m;
        var lifetimeSpent = account?.LifetimeSpent ?? 0m;

        var tier = _options.ResolveTier(lifetimeSpent);
        var next = _options.NextTier(lifetimeSpent);

        var summary = new CashbackSummary
        {
            Enabled = _options.Enabled,
            Balance = balance,
            LifetimeEarned = lifetimeEarned,
            LifetimeSpent = lifetimeSpent,
            CurrentTierName = tier.Name,
            CurrentRatePercent = tier.RatePercent
        };

        if (next is null)
        {
            summary.ProgressPercent = 100m;
            return summary;
        }

        summary.NextTierName = next.Name;
        summary.NextTierRatePercent = next.RatePercent;
        summary.NextTierThreshold = next.MinLifetimeSpent;
        summary.AmountToNextTier = Round(Math.Max(0m, next.MinLifetimeSpent - lifetimeSpent));

        var band = next.MinLifetimeSpent - tier.MinLifetimeSpent;
        var into = lifetimeSpent - tier.MinLifetimeSpent;
        summary.ProgressPercent = band > 0m
            ? Math.Clamp(Round(into / band * 100m), 0m, 100m)
            : 0m;

        return summary;
    }

    public Task<IReadOnlyList<CashbackTransaction>> GetHistoryAsync(string userId, int limit)
    {
        var safeLimit = limit is > 0 and <= 200 ? limit : 50;
        return _transactions.GetByUserAsync(userId, safeLimit);
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
