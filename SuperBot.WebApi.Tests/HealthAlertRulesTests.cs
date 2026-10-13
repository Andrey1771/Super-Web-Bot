using System;
using SuperBot.WebApi.Services.Health;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Когда писать владельцу о состоянии сервиса.
///
/// Ошибка здесь дороже, чем в самих проверках, и дорога она в обе стороны. Письмо на каждый
/// прогон — это письмо раз в пять минут, и через день на них перестают смотреть. Молчание
/// возвращает к тому, с чего всё началось: вебхук был мёртв неделю, и заметил это человек.
/// </summary>
public class HealthAlertRulesTests
{
    private static readonly DateTime Now = new(2026, 9, 8, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void FirstFailure_isReported()
    {
        Assert.Equal(HealthAlertAction.Broken, HealthAlertRules.Decide("ok", "down", null, Now));
    }

    [Fact]
    public void FailureOnTheVeryFirstRun_isReportedToo()
    {
        // Снимка ещё нет — например, сервис только развернули. Молчать нельзя.
        Assert.Equal(HealthAlertAction.Broken, HealthAlertRules.Decide(null, "down", null, Now));
    }

    [Fact]
    public void StillBrokenWithinTheDay_staysSilent()
    {
        // Проверка идёт раз в пять минут: без этого правила почта превратилась бы в поток.
        var action = HealthAlertRules.Decide("down", "down", Now.AddHours(-3), Now);

        Assert.Equal(HealthAlertAction.None, action);
    }

    [Fact]
    public void StillBrokenAfterADay_remindsOnce()
    {
        var action = HealthAlertRules.Decide("down", "down", Now.AddHours(-25), Now);

        Assert.Equal(HealthAlertAction.Reminder, action);
    }

    [Fact]
    public void BrokenButNeverReported_remindsImmediately()
    {
        // Сервис перезапустили, отметка о письме потерялась — о поломке всё равно надо сказать.
        var action = HealthAlertRules.Decide("down", "down", null, Now);

        Assert.Equal(HealthAlertAction.Reminder, action);
    }

    [Fact]
    public void Recovery_isReported()
    {
        // Без этого письма владелец не узнает, что можно выдохнуть, и полезет проверять руками.
        Assert.Equal(HealthAlertAction.Recovered, HealthAlertRules.Decide("down", "ok", Now.AddHours(-1), Now));
    }

    [Fact]
    public void SteadyHealth_saysNothing()
    {
        Assert.Equal(HealthAlertAction.None, HealthAlertRules.Decide("ok", "ok", null, Now));
    }

    /// <summary>
    /// «warn» — это «не смогли спросить» или «ответ странный». Состояние записывается и видно
    /// на дашборде, но будить им никого нельзя: иначе первая же заминка сети превращается
    /// в ложную тревогу, а на ложные тревоги перестают реагировать.
    /// </summary>
    [Theory]
    [InlineData("warn")]
    [InlineData("configured")]
    [InlineData("unconfigured")]
    public void AmbiguousStates_doNotRaiseAlarm(string state)
    {
        Assert.Equal(HealthAlertAction.None, HealthAlertRules.Decide("ok", state, null, Now));
        Assert.False(HealthAlertRules.IsBroken(state));
    }

    [Fact]
    public void LeavingABrokenStateForAnAmbiguousOne_countsAsRecovery()
    {
        // Не идеальный исход, но честный: «down» кончился, и держать тревогу открытой,
        // пока состояние неизвестно, — значит никогда её не закрыть.
        Assert.Equal(HealthAlertAction.Recovered, HealthAlertRules.Decide("down", "warn", Now.AddHours(-1), Now));
    }
}
