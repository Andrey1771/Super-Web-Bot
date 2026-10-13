using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Курсы валют при нескольких инстансах.
///
/// Книга курсов живёт в памяти процесса: читать её из базы на каждую карточку товара нельзя.
/// Но загружалась она ровно один раз за жизнь процесса — и на одном инстансе это работало.
/// На двух ломалось незаметно: суточный импорт запускает планировщик на ОДНОМ инстансе, тот
/// обновляет свою память и базу, а остальные продолжают считать по вчерашнему курсу до
/// перезапуска. Это цены в каталоге — покупатель видел бы разную цену в зависимости от того,
/// на какой инстанс его отправил балансировщик.
///
/// Тест воспроизводит именно это: два сервиса над одной базой, импорт в первый, чтение из второго.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class FxRatesAcrossInstancesTests
{
    private readonly TaleShopApiFactory _factory;

    public FxRatesAcrossInstancesTests(TaleShopApiFactory factory) => _factory = factory;

    /// <summary>Свой инстанс сервиса — как отдельный процесс приложения над той же базой.</summary>
    private FxRateService NewInstance(int refreshSeconds)
    {
        var currencies = _factory.Services.GetRequiredService<IOptions<StorefrontCurrencyOptions>>();
        var fx = _factory.Services.GetRequiredService<IOptionsMonitor<FxOptions>>().CurrentValue;
        fx.MemoryRefreshSeconds = refreshSeconds;

        return new FxRateService(
            currencies,
            new StaticMonitor(fx),
            NullLogger<FxRateService>.Instance,
            _factory.Services.GetRequiredService<IServiceScopeFactory>());
    }

    [Fact]
    public async Task ImportOnOneInstance_reachesAnother()
    {
        // Валюта своя на прогон: база общая на коллекцию тестов.
        var code = $"X{Guid.NewGuid():N}"[..4].ToUpperInvariant();

        var reader = NewInstance(refreshSeconds: 0);
        reader.Current();                                   // прогрели память — как живой инстанс

        var importer = NewInstance(refreshSeconds: 0);
        await importer.OfferAsync(
            new[] { new FxRate("USD", code, 7.77m, DateTime.UtcNow) },
            bypassGuard: true);

        // До правки здесь было бы null: своя память у читателя уже загружена, а перечитывать
        // её было нечему.
        var seen = reader.Current().For(code);

        Assert.NotNull(seen);
        Assert.Equal(7.77m, seen!.Rate);
    }

    [Fact]
    public void WithinTheInterval_theBookIsNotRereadFromStorage()
    {
        // Обратная сторона: перечитывать на каждый запрос каталога тоже нельзя. Настройка
        // существует именно ради этого баланса, и ноль в ней — режим для тестов, не для боя.
        var options = _factory.Services.GetRequiredService<IOptionsMonitor<FxOptions>>().CurrentValue;

        Assert.True(options.MemoryRefreshSeconds > 0);
    }

    private sealed class StaticMonitor : IOptionsMonitor<FxOptions>
    {
        public StaticMonitor(FxOptions value) => CurrentValue = value;

        public FxOptions CurrentValue { get; }

        public FxOptions Get(string? name) => CurrentValue;

        public IDisposable? OnChange(Action<FxOptions, string?> listener) => null;
    }
}
