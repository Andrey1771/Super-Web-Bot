using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Дневной счётчик расходов на внешнюю модель. Когда лимит выбран, роутер перестаёт ходить
/// в платный API и работает на локальной модели — чат продолжает отвечать, счёт не растёт.
/// Счётчик живёт в памяти процесса: при рестарте обнуляется, при нескольких экземплярах
/// сервиса лимит будет свой у каждого (как и остальные ограничители чата).
/// </summary>
public interface ILlmSpendTracker
{
    bool IsWithinBudget { get; }

    decimal SpentTodayUsd { get; }

    void Record(LlmUsage? usage);

    /// <summary>Цена вызова по текущему прайсу. Для локальной модели — ноль.</summary>
    decimal EstimateUsd(LlmUsage? usage);
}

public class LlmSpendTracker : ILlmSpendTracker
{
    // Монитор: дневной бюджет правится из админки на лету.
    private readonly IOptionsMonitor<SupportChatOptions> _monitor;
    private SupportChatOptions _options => _monitor.CurrentValue;
    private readonly ILogger<LlmSpendTracker> _logger;
    private readonly object _gate = new();

    private DateOnly _day = DateOnly.FromDateTime(DateTime.UtcNow);
    private decimal _spentToday;
    private bool _limitReported;

    public LlmSpendTracker(IOptionsMonitor<SupportChatOptions> options, ILogger<LlmSpendTracker> logger)
    {
        _monitor = options;
        _logger = logger;
    }

    public decimal SpentTodayUsd
    {
        get
        {
            lock (_gate)
            {
                RollDay();
                return _spentToday;
            }
        }
    }

    public bool IsWithinBudget
    {
        get
        {
            if (_options.DailyBudgetUsd <= 0)
            {
                return true; // лимит не задан
            }

            lock (_gate)
            {
                RollDay();
                if (_spentToday < _options.DailyBudgetUsd)
                {
                    return true;
                }

                if (!_limitReported)
                {
                    _limitReported = true;
                    _logger.LogWarning(
                        "Daily support chat budget of {Budget} USD is used up ({Spent} USD). Falling back to the local model until tomorrow.",
                        _options.DailyBudgetUsd, decimal.Round(_spentToday, 4));
                }

                return false;
            }
        }
    }

    public decimal EstimateUsd(LlmUsage? usage)
    {
        if (usage is not { Billable: true })
        {
            return 0m;
        }

        return
            usage.InputTokens / 1_000_000m * _options.InputPricePerMillionUsd +
            usage.CachedInputTokens / 1_000_000m * _options.CachedInputPricePerMillionUsd +
            usage.OutputTokens / 1_000_000m * _options.OutputPricePerMillionUsd;
    }

    public void Record(LlmUsage? usage)
    {
        var cost = EstimateUsd(usage);
        if (cost <= 0m)
        {
            return;
        }

        lock (_gate)
        {
            RollDay();
            _spentToday += cost;
        }
    }

    private void RollDay()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (today == _day)
        {
            return;
        }

        _day = today;
        _spentToday = 0m;
        _limitReported = false;
    }
}
