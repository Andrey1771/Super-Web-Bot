using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Отвечает на вопрос «когда ответит живой человек». Без этого «специалист скоро подключится»
/// означает и пять минут, и следующее утро — клиент ждёт впустую и уходит раздражённым.
/// </summary>
public interface ISupportAvailability
{
    SupportAvailabilityState GetState();
}

/// <param name="Configured">Часы работы не заданы — обещать конкретное время нельзя.</param>
/// <param name="IsOpen">Сейчас рабочее время.</param>
/// <param name="ExpectedWaitMinutes">Типичное ожидание ответа в рабочее время.</param>
/// <param name="OpensAt">Ближайшее время начала работы (в часовом поясе поддержки), когда закрыто.</param>
public record SupportAvailabilityState(bool Configured, bool IsOpen, int ExpectedWaitMinutes, DateTime? OpensAt);

public class SupportAvailability : ISupportAvailability
{
    private readonly SupportChatOptions _options;
    private readonly ILogger<SupportAvailability> _logger;
    private readonly TimeZoneInfo _timeZone;

    public SupportAvailability(IOptions<SupportChatOptions> options, ILogger<SupportAvailability> logger)
    {
        _options = options.Value;
        _logger = logger;
        _timeZone = ResolveTimeZone(_options.BusinessHoursTimeZone, logger);
    }

    public SupportAvailabilityState GetState()
    {
        if (!_options.BusinessHoursEnabled)
        {
            return new SupportAvailabilityState(false, true, Math.Max(0, _options.ExpectedWaitMinutes), null);
        }

        var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, _timeZone).DateTime;
        var wait = Math.Max(0, _options.ExpectedWaitMinutes);

        if (IsWorkingMoment(now))
        {
            return new SupportAvailabilityState(true, true, wait, null);
        }

        return new SupportAvailabilityState(true, false, wait, FindNextOpening(now));
    }

    private bool IsWorkingMoment(DateTime moment) =>
        IsWorkingDay(moment) && moment.Hour >= _options.BusinessHoursStart && moment.Hour < _options.BusinessHoursEnd;

    // Дни недели заданы числами 1–7 (понедельник–воскресенье); пустой список = работаем всю неделю.
    private bool IsWorkingDay(DateTime moment)
    {
        var days = _options.BusinessDays;
        if (days == null || days.Length == 0)
        {
            return true;
        }

        var isoDay = moment.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)moment.DayOfWeek;
        return days.Contains(isoDay);
    }

    private DateTime? FindNextOpening(DateTime from)
    {
        // Сегодня ещё до открытия — откроемся сегодня же, иначе ищем ближайший рабочий день.
        if (IsWorkingDay(from) && from.Hour < _options.BusinessHoursStart)
        {
            return from.Date.AddHours(_options.BusinessHoursStart);
        }

        for (var offset = 1; offset <= 7; offset++)
        {
            var candidate = from.Date.AddDays(offset);
            if (IsWorkingDay(candidate))
            {
                return candidate.AddHours(_options.BusinessHoursStart);
            }
        }

        return null;
    }

    private static TimeZoneInfo ResolveTimeZone(string? id, ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return TimeZoneInfo.Utc;
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            // Ошибиться на несколько часов в обещании хуже, чем не обещать ничего, — но и падать не за что.
            logger.LogWarning(ex, "Unknown support time zone {TimeZone}; falling back to UTC.", id);
            return TimeZoneInfo.Utc;
        }
    }
}
