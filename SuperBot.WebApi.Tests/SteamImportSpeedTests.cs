using System.Diagnostics;
using SuperBot.WebApi.Services.SteamImport;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Скорость импорта упирается в лимит Steam (~200 запросов за 5 минут), поэтому лишних запросов не делаем:
/// переводы DLC — только на его языки, а пауза между запросами считается от начала предыдущего.
/// </summary>
public class SteamImportSpeedTests
{
    private static SteamApp App(string languages) => new() { AppId = "1", Type = "dlc", Name = "DLC", SupportedLanguagesHtml = languages };

    [Fact]
    public void Dlc_asks_only_for_translations_it_has()
    {
        var app = App("English<strong>*</strong>, Russian, German<br><strong>*</strong>languages with full audio support");

        Assert.Equal(["ru"], SteamCatalogImporter.TranslationsFor(app, isDlc: true).Select(t => t.Locale));
        // Игра — за всеми переводами: страницу игры Steam переводит и без перевода самой игры.
        Assert.Equal(["ru", "uk", "pl"], SteamCatalogImporter.TranslationsFor(app, isDlc: false).Select(t => t.Locale));
        // Языки не указаны — не гадаем, спрашиваем всё.
        Assert.Equal(["ru", "uk", "pl"], SteamCatalogImporter.TranslationsFor(App(""), isDlc: true).Select(t => t.Locale));
    }

    [Fact]
    public async Task Lane_spaces_request_starts_and_pauses_after_a_refusal()
    {
        var lane = new SteamStoreClient.RequestLane();
        var interval = TimeSpan.FromMilliseconds(120);
        var clock = Stopwatch.StartNew();

        await lane.WaitTurnAsync(interval, CancellationToken.None);
        await lane.WaitTurnAsync(interval, CancellationToken.None);
        await lane.WaitTurnAsync(interval, CancellationToken.None);
        Assert.InRange(clock.ElapsedMilliseconds, 230, 1000);

        clock.Restart();
        lane.PauseFor(TimeSpan.FromMilliseconds(400));
        await lane.WaitTurnAsync(interval, CancellationToken.None);
        Assert.InRange(clock.ElapsedMilliseconds, 380, 1500);
    }
}
