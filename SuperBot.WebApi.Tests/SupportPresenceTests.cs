using SuperBot.WebApi.Support.Chat;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Присутствие клиента в диалоге. Ошибка стоит по-разному в разные стороны: показать
/// ушедшего как читающего — специалист зря ждёт ответа; показать читающего как ушедшего —
/// специалист закроет диалог у человека перед носом. Второе хуже, поэтому у свежести
/// запас относительно интервала опроса, а отметка «из будущего» считается свежей.
/// </summary>
public class SupportPresenceTests
{
    private static readonly DateTime Now = new(2026, 8, 18, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void No_mark_at_all_is_unknown()
    {
        Assert.Equal(SupportPresenceState.Unknown, SupportPresence.Resolve(null, viewing: true, Now));
    }

    [Fact]
    public void Fresh_mark_with_open_window_is_viewing()
    {
        var lastSeen = Now.AddSeconds(-3);
        Assert.Equal(SupportPresenceState.Viewing, SupportPresence.Resolve(lastSeen, viewing: true, Now));
    }

    [Fact]
    public void Fresh_mark_with_closed_window_is_only_online()
    {
        var lastSeen = Now.AddSeconds(-3);
        Assert.Equal(SupportPresenceState.Online, SupportPresence.Resolve(lastSeen, viewing: false, Now));
    }

    [Fact]
    public void Mark_older_than_freshness_is_away_even_with_open_window()
    {
        var lastSeen = Now - SupportPresence.Freshness.Add(TimeSpan.FromSeconds(1));
        Assert.Equal(SupportPresenceState.Away, SupportPresence.Resolve(lastSeen, viewing: true, Now));
    }

    [Fact]
    public void Write_interval_stays_below_freshness()
    {
        // Иначе клиент, который никуда не уходил, мигал бы между «на сайте» и «ушёл»:
        // отметка успевала бы протухнуть раньше, чем виджет запишет следующую.
        Assert.True(SupportPresence.WriteInterval < SupportPresence.Freshness);
    }

    [Fact]
    public void Mark_from_the_future_counts_as_fresh()
    {
        // Расхождение часов между серверами не должно объявлять ушедшим того, кто печатает.
        var lastSeen = Now.AddSeconds(30);
        Assert.Equal(SupportPresenceState.Viewing, SupportPresence.Resolve(lastSeen, viewing: true, Now));
    }

    [Theory]
    [InlineData(SupportPresenceState.Viewing, "viewing")]
    [InlineData(SupportPresenceState.Online, "online")]
    [InlineData(SupportPresenceState.Away, "away")]
    [InlineData(SupportPresenceState.Unknown, "unknown")]
    public void Format_matches_the_contract_the_admin_panel_expects(SupportPresenceState state, string expected)
    {
        Assert.Equal(expected, SupportPresence.Format(state));
    }
}
