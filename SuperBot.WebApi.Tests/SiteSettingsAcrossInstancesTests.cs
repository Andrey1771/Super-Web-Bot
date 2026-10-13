using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using SuperBot.WebApi.Services.SiteSettings;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Настройки магазина при нескольких инстансах.
///
/// Документ настроек живёт в памяти процесса: ходить за ним в базу на каждый запрос нельзя.
/// Но читался он ровно один раз за жизнь процесса и обновлялся только при сохранении НА ЭТОМ ЖЕ
/// инстансе. На одном сервере это работало, на двух ломалось молча: владелец правит часы
/// поддержки или выключает платёжную рельсу в админке, запрос попадает на первый инстанс — и
/// второй продолжает жить со старыми настройками до перезапуска. Что увидит покупатель,
/// зависело от того, на какой инстанс его отправил балансировщик.
///
/// Тест воспроизводит именно это: два экземпляра хранилища над одной базой, запись в первый,
/// чтение из второго.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class SiteSettingsAcrossInstancesTests
{
    private readonly TaleShopApiFactory _factory;

    public SiteSettingsAcrossInstancesTests(TaleShopApiFactory factory) => _factory = factory;

    /// <summary>Свой экземпляр хранилища — как отдельный процесс приложения над той же базой.</summary>
    private SiteSettingsStore NewInstance(int refreshSeconds)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SiteSettings:RefreshSeconds"] = refreshSeconds.ToString(),
            })
            .Build();

        return new SiteSettingsStore(
            _factory.Services.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            NullLogger<SiteSettingsStore>.Instance);
    }

    [Fact]
    public async Task An_edit_on_one_instance_reaches_the_other()
    {
        var edited = NewInstance(refreshSeconds: 30);
        // Нулевой интервал = «перечитывать при каждом обращении»: тест не должен ждать полминуты.
        var other = NewInstance(refreshSeconds: 0);

        var marker = $"Europe/Berlin-{Guid.NewGuid():N}"[..24];
        await edited.SaveAsync(doc => doc.BusinessHoursTimeZone = marker, "test");

        Assert.Equal(marker, other.Current.BusinessHoursTimeZone);
    }

    [Fact]
    public async Task Until_the_interval_passes_the_copy_in_memory_is_kept()
    {
        var edited = NewInstance(refreshSeconds: 30);
        var other = NewInstance(refreshSeconds: 30);

        // Прогреваем: второй экземпляр прочитал документ и запомнил время чтения.
        var before = other.Current.BusinessHoursTimeZone;

        await edited.SaveAsync(doc => doc.BusinessHoursTimeZone = "Europe/Lisbon", "test");

        // Полминуты ещё не прошло — в базу не ходим. Это не баг, а цена того, что настройки
        // не читаются из базы на каждый запрос.
        Assert.Equal(before, other.Current.BusinessHoursTimeZone);
    }

    [Fact]
    public async Task A_change_made_elsewhere_wakes_up_options_subscribers()
    {
        var edited = NewInstance(refreshSeconds: 30);
        var other = NewInstance(refreshSeconds: 0);

        _ = other.Current; // первое чтение
        var fired = false;
        other.ChangeToken.RegisterChangeCallback(_ => fired = true, null);

        await edited.SaveAsync(doc => doc.ExpectedWaitMinutes = Random.Shared.Next(5, 500), "test");
        _ = other.Current; // подхватываем чужую правку

        Assert.True(fired, "IOptionsMonitor должен узнать о правке, сделанной на другом инстансе");
    }

    [Fact]
    public async Task Reading_again_without_changes_does_not_disturb_subscribers()
    {
        var store = NewInstance(refreshSeconds: 0);
        await store.SaveAsync(doc => doc.ExpectedWaitMinutes = 42, "test");

        var fired = false;
        store.ChangeToken.RegisterChangeCallback(_ => fired = true, null);

        // Несколько чтений подряд при нулевом интервале — каждое идёт в базу, но документ тот же.
        for (var i = 0; i < 3; i++)
        {
            _ = store.Current;
        }

        Assert.False(fired, "без изменений пересобирать Options незачем");
    }

    [Fact]
    public async Task A_database_hiccup_does_not_wipe_the_settings()
    {
        var store = NewInstance(refreshSeconds: 0);
        await store.SaveAsync(doc => doc.BusinessHoursTimeZone = "Europe/Berlin", "test");

        // Документ исчез из базы (сбой, чистка, не та база) — в памяти остаётся пустой,
        // но это именно «нет переопределений», а не потеря чужих настроек.
        // База зарегистрирована как scoped, поэтому тянуть её из корневого провайдера нельзя:
        // проверка областей видимости в DI отклоняет такое обращение.
        using var scope = _factory.Services.CreateScope();
        var collection = scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
            .GetCollection<SiteSettingsDocument>(SiteSettingsStore.CollectionName);
        await collection.DeleteOneAsync(doc => doc.Id == "site");

        Assert.Null(store.Current.BusinessHoursTimeZone);
    }
}
