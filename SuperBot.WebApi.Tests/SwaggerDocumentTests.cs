using System.Net;
using System.Text.Json;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Swagger включён в Development (тестовый хост запускается именно так). Генератор схемы падает
/// во время запроса, а не при сборке: конфликт имён DTO или несовместимость Swashbuckle с моделью
/// OpenAPI всплыли бы только у того, кто откроет /swagger. Тест держит документ собираемым.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class SwaggerDocumentTests
{
    private readonly TaleShopApiFactory _factory;

    public SwaggerDocumentTests(TaleShopApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Swagger_document_is_generated_for_the_whole_api()
    {
        var response = await _factory.CreateClient().GetAsync("/swagger/v1/swagger.json");

        var body = await response.Content.ReadAsStringAsync();
        // При ошибке генератора в теле ответа — его исключение: без него причину пришлось бы искать заново.
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {body[..Math.Min(body.Length, 3000)]}");
        var document = JsonSerializer.Deserialize<JsonElement>(body);
        Assert.StartsWith("3.", document.GetProperty("openapi").GetString());
        // Документ описывает реальные контроллеры, а не пустую заготовку. Путь сравниваем без учёта
        // регистра: шаблон [controller] даёт «Game», а маршрутизация ASP.NET к регистру безразлична.
        var paths = document.GetProperty("paths").EnumerateObject().Select(path => path.Name).ToList();
        Assert.Contains(paths, path => string.Equals(path, "/api/game/genres", StringComparison.OrdinalIgnoreCase));
    }
}
