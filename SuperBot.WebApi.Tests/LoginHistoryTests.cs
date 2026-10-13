using System.Net;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Журнал входов (экран «Login history»).
///
/// Тест появился после случая, когда страница показывала 502 всегда, а не при сбое: сервер
/// пересылал в Keycloak токен того, кто открыл страницу, а у администратора магазина ролей
/// realm-management нет и не должно быть — это разные системы прав, и Keycloak отвечал 403.
/// Читать журнал должен служебный аккаунт, а решать «пускать ли» — наша роль admin.
///
/// Keycloak в тестовой среде недоступен, поэтому здесь проверяется контракт вокруг него:
/// кого пускать к эндпоинту и каким статусом отвечать, когда Keycloak не отозвался.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class LoginHistoryTests
{
    private readonly TaleShopApiFactory _factory;

    public LoginHistoryTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Client(string roles)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, "agent@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, roles);
        return client;
    }

    [Fact]
    public async Task Login_history_is_admin_only()
    {
        // Поддержка смотрит клиентов, но не журнал входов всего магазина.
        var response = await Client("support").GetAsync("/api/admin/data");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unavailable_keycloak_answers_bad_gateway_not_server_error()
    {
        // Пятисотка означала бы «сломались мы»; здесь не отозвалась внешняя система, и по
        // 502 фронт показывает «сервер не ответил, попробуйте ещё раз», а не пустой список.
        var response = await Client("admin").GetAsync("/api/admin/data");

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }
}
