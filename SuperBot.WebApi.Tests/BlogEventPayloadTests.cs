using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading.Tasks;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Приём событий блога с тем телом, которое реально шлёт браузер.
///
/// Событие показа поста уходит из ленты без поля meta — его там просто нечем заполнить.
/// А в проекте включены nullable reference types, и ASP.NET считает НЕнулевое ссылочное
/// свойство обязательным: тело отклонялось валидацией с «The Meta field is required» ещё до
/// входа в метод контроллера. Наружу это выглядело не как поломка, а как скромная
/// статистика — показы просто не доходили.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class BlogEventPayloadTests
{
    private readonly TaleShopApiFactory _factory;

    public BlogEventPayloadTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public async Task ImpressionWithoutMeta_isAccepted()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/blog/events", new
        {
            postId = $"post-{Guid.NewGuid():N}",
            eventType = "POST_IMPRESSION",
            ts = DateTime.UtcNow,
            anonId = $"anon-{Guid.NewGuid():N}",
            sessionId = $"session-{Guid.NewGuid():N}",
            referrer = "http://taleshop.test/news"
        });

        Assert.NotEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task BareMinimumBody_isAlsoAccepted()
    {
        // Маяк из старой закешированной сборки может прислать только два поля. Отклонять
        // такое — терять данные молча; обязательными остаются ровно те, без которых событие
        // бессмысленно.
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/blog/events", new
        {
            postId = $"post-{Guid.NewGuid():N}",
            eventType = "POST_IMPRESSION"
        });

        Assert.NotEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task EventWithoutPostId_isStillRejected()
    {
        // Обратная сторона: событие без поста ни к чему не относится и в статистику попасть
        // не должно.
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/blog/events", new
        {
            eventType = "POST_IMPRESSION"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UnknownEventType_isRejected()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/blog/events", new
        {
            postId = $"post-{Guid.NewGuid():N}",
            eventType = "POST_SOMETHING_ELSE"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
