namespace SuperBot.WebApi.Services.Health;

/// <summary>Что делать с проверкой после очередного прогона.</summary>
public enum HealthAlertAction
{
    /// <summary>Ничего: состояние не изменилось и напоминать ещё рано.</summary>
    None,

    /// <summary>Сломалось только что — сообщить.</summary>
    Broken,

    /// <summary>Починилось — сообщить, иначе владелец не узнает, что можно выдохнуть.</summary>
    Recovered,

    /// <summary>Всё ещё сломано, и с прошлого письма прошли сутки.</summary>
    Reminder
}

/// <summary>
/// Когда писать владельцу о состоянии сервиса.
///
/// Правила выделены отдельно и без ввода-вывода, потому что ошибиться здесь дороже всего.
/// Письмо на каждый прогон — это письмо раз в пять минут, и через день на них перестают
/// смотреть; молчание же возвращает нас к тому, с чего начали: вебхук был мёртв неделю, и
/// заметил это человек, а не система.
///
/// Тревожимся только на «down» — то есть на «проверка сходила и получила отказ». Состояние
/// «warn» неоднозначно (не смогли спросить, странный ответ) и в почту не идёт: оно
/// записывается и видно на дашборде, но будить им никого нельзя.
/// </summary>
public static class HealthAlertRules
{
    /// <summary>Как часто напоминать, пока не починили.</summary>
    public static readonly TimeSpan ReminderInterval = TimeSpan.FromHours(24);

    public static bool IsBroken(string? state) =>
        string.Equals(state, "down", StringComparison.OrdinalIgnoreCase);

    /// <param name="previousState">Состояние из прошлого снимка; null — проверки ещё не было.</param>
    /// <param name="lastNotifiedUtc">Когда в последний раз писали об этой проверке.</param>
    public static HealthAlertAction Decide(
        string? previousState,
        string newState,
        DateTime? lastNotifiedUtc,
        DateTime utcNow)
    {
        var wasBroken = IsBroken(previousState);
        var isBroken = IsBroken(newState);

        if (isBroken && !wasBroken)
        {
            return HealthAlertAction.Broken;
        }

        if (!isBroken && wasBroken)
        {
            return HealthAlertAction.Recovered;
        }

        if (isBroken)
        {
            // Первый прогон после перезапуска сервиса не должен молчать только потому, что
            // о поломке никто ещё не писал: без отметки времени считаем, что не писали.
            return lastNotifiedUtc is null || utcNow - lastNotifiedUtc.Value >= ReminderInterval
                ? HealthAlertAction.Reminder
                : HealthAlertAction.None;
        }

        return HealthAlertAction.None;
    }
}
