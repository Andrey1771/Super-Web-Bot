namespace SuperBot.WebApi.Support.Chat;

/// <summary>
/// Где сейчас клиент относительно своего диалога.
/// </summary>
public enum SupportPresenceState
{
    /// <summary>Виджет ни разу не отметился — диалог старше этой возможности либо клиент ушёл давно.</summary>
    Unknown,

    /// <summary>Страница закрыта: отметок давно нет.</summary>
    Away,

    /// <summary>Страница открыта, но окно чата свёрнуто или вкладка неактивна.</summary>
    Online,

    /// <summary>Окно чата открыто на активной вкладке — клиент видит переписку прямо сейчас.</summary>
    Viewing
}

/// <summary>
/// Присутствие снимается с обычных запросов виджета за новыми сообщениями: он опрашивает
/// сервер каждые три секунды, пока страница открыта, и вместе с запросом сообщает, открыто
/// ли окно чата. Отдельного канала и отдельных «пингов» для этого не понадобилось.
/// </summary>
public static class SupportPresence
{
    /// <summary>
    /// Сколько отметка считается свежей. Заметно больше интервала опроса: одна потерянная
    /// сеть не должна превращать клиента, который сидит и читает, в ушедшего.
    /// </summary>
    public static readonly TimeSpan Freshness = TimeSpan.FromSeconds(20);

    /// <summary>
    /// Как часто отметка уходит в базу. Писать на каждый опрос незачем — на «онлайн или нет»
    /// это не влияет, а записей стало бы втрое больше. Интервал держим меньше
    /// <see cref="Freshness"/>, иначе клиент мигал бы между «на сайте» и «ушёл».
    /// </summary>
    public static readonly TimeSpan WriteInterval = TimeSpan.FromSeconds(10);

    public static SupportPresenceState Resolve(DateTime? lastSeenAtUtc, bool viewing, DateTime nowUtc)
    {
        if (lastSeenAtUtc is null)
        {
            return SupportPresenceState.Unknown;
        }

        // Отметка из будущего — расхождение часов между серверами. Считаем её свежей:
        // объявить ушедшим того, кто прямо сейчас печатает, хуже, чем наоборот.
        if (nowUtc - lastSeenAtUtc.Value > Freshness)
        {
            return SupportPresenceState.Away;
        }

        return viewing ? SupportPresenceState.Viewing : SupportPresenceState.Online;
    }

    public static string Format(SupportPresenceState state) => state switch
    {
        SupportPresenceState.Viewing => "viewing",
        SupportPresenceState.Online => "online",
        SupportPresenceState.Away => "away",
        _ => "unknown"
    };
}
