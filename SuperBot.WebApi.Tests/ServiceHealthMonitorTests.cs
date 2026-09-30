using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Services.Health;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Фоновый прогон проверок здоровья.
///
/// Правила «когда писать» проверяются отдельно и без базы (HealthAlertRulesTests); здесь —
/// что прогон действительно доходит до конца, кладёт снимок по каждой проверке и не рассылает
/// писем на ровном месте. Последнее важнее, чем кажется: монитор ходит раз в пять минут, и
/// лишнее письмо тут превращается в почту, на которую перестают смотреть.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class ServiceHealthMonitorTests
{
    private readonly TaleShopApiFactory _factory;

    public ServiceHealthMonitorTests(TaleShopApiFactory factory) => _factory = factory;

    private async Task RunAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ServiceHealthMonitor>().RunAsync();
    }

    private async Task<BsonDocument?> SnapshotAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        return await database.GetCollection<BsonDocument>(ServiceHealthMonitor.CollectionName)
            .Find(Builders<BsonDocument>.Filter.Eq("_id", name))
            .FirstOrDefaultAsync();
    }

    [Fact]
    public async Task Run_storesASnapshotForEveryCheck()
    {
        await RunAsync();

        var mongo = await SnapshotAsync("MongoDB");
        Assert.NotNull(mongo);
        Assert.Equal("ok", mongo!["state"].AsString);
        Assert.True(mongo.Contains("since"));
        Assert.True(mongo.Contains("updatedAt"));

        // Проверки, которые в тестовом хосте не ходят наружу, всё равно попадают в снимок —
        // иначе после включения проб первая же авария выглядела бы как «было всегда».
        Assert.NotNull(await SnapshotAsync("Telegram webhook"));
        Assert.NotNull(await SnapshotAsync("Mail (SMTP)"));
    }

    [Fact]
    public async Task Snapshots_hideChecksThatNoLongerExist()
    {
        // Снимок убранной из кода проверки (так на стенде осталась ЮKassa) не должен висеть на странице вечно.
        // Прогон его не трогает — фильтрует чтение: у живых проверок снимки свежие, у убранной он застыл.
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<IMongoDatabase>()
                .GetCollection<BsonDocument>(ServiceHealthMonitor.CollectionName)
                .ReplaceOneAsync(
                    Builders<BsonDocument>.Filter.Eq("_id", "YooKassa"),
                    new BsonDocument { { "_id", "YooKassa" }, { "state", "unconfigured" }, { "since", DateTime.UtcNow.AddDays(-9) } },
                    new ReplaceOptions { IsUpsert = true });
        }

        await RunAsync();

        Assert.NotNull(await SnapshotAsync("YooKassa"));
        using var reader = _factory.Services.CreateScope();
        var shown = await reader.ServiceProvider.GetRequiredService<ServiceHealthMonitor>().GetSnapshotsAsync();
        Assert.DoesNotContain(shown, item => item.Name == "YooKassa");
        Assert.Contains(shown, item => item.Name == "MongoDB");
    }

    [Fact]
    public async Task HealthyRun_sendsNothing()
    {
        _factory.Mail.Clear();

        await RunAsync();

        Assert.DoesNotContain(_factory.Mail.Sent, mail => mail.Subject.Contains("is down"));
    }

    [Fact]
    public async Task RepeatedRuns_keepTheMomentTheStateBegan()
    {
        await RunAsync();
        var first = (await SnapshotAsync("MongoDB"))!["since"].ToUniversalTime();

        await RunAsync();
        var second = (await SnapshotAsync("MongoDB"))!["since"].ToUniversalTime();

        // «Сломано с такого-то момента» — половина ценности снимка: без него непонятно,
        // авария сейчас или неделю назад. Пока состояние прежнее, отметка двигаться не должна.
        Assert.Equal(first, second);
    }
}
