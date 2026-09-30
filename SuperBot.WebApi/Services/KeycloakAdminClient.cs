using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SuperBot.WebApi.Services
{
    /// <summary>
    /// Служебный клиент Keycloak не настроен: не задан секрет, id клиента, адрес или realm.
    ///
    /// Отдельный тип нужен, чтобы отличать «мы не туда сходили» от «нам не сказали, куда идти».
    /// С пустым секретом Keycloak отвечает 401, и наружу это выходило пятисоткой — по ней
    /// невозможно догадаться, что дело в незаполненной переменной окружения.
    /// </summary>
    public class KeycloakAdminNotConfiguredException : InvalidOperationException
    {
        public KeycloakAdminNotConfiguredException(IReadOnlyList<string> missing)
            : base("Keycloak admin client is not configured: " + string.Join(", ", missing) + ".")
        {
            Missing = missing;
        }

        /// <summary>Названия незаполненных настроек — в логи и в ответ, без значений.</summary>
        public IReadOnlyList<string> Missing { get; }
    }

    public class KeycloakAdminClient
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly SemaphoreSlim _tokenLock = new(1, 1);
        private string? _accessToken;
        private DateTimeOffset _tokenExpiresAt = DateTimeOffset.MinValue;

        public KeycloakAdminClient(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        private string BaseUrl => _configuration["Keycloak:Admin:BaseUrl"]?.TrimEnd('/') ?? string.Empty;
        private string Realm => _configuration["Keycloak:Admin:Realm"] ?? string.Empty;
        private string ClientId => _configuration["Keycloak:Admin:ClientId"] ?? string.Empty;
        private string ClientSecret => _configuration["Keycloak:Admin:ClientSecret"] ?? string.Empty;

        private string AdminUsersPath => $"{BaseUrl}/admin/realms/{Realm}/users";

        /// <summary>Чего не хватает, чтобы вообще идти в Keycloak. Пусто — значит всё на месте.</summary>
        public IReadOnlyList<string> MissingConfiguration()
        {
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(BaseUrl)) missing.Add("Keycloak:Admin:BaseUrl");
            if (string.IsNullOrWhiteSpace(Realm)) missing.Add("Keycloak:Admin:Realm");
            if (string.IsNullOrWhiteSpace(ClientId)) missing.Add("Keycloak:Admin:ClientId");
            if (string.IsNullOrWhiteSpace(ClientSecret)) missing.Add("Keycloak:Admin:ClientSecret");
            return missing;
        }

        private async Task<string> GetAccessTokenAsync()
        {
            if (_accessToken != null && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
            {
                return _accessToken;
            }

            // Проверяем до запроса: с пустым секретом Keycloak ответит 401, и причина потеряется.
            var missing = MissingConfiguration();
            if (missing.Count > 0)
            {
                throw new KeycloakAdminNotConfiguredException(missing);
            }

            await _tokenLock.WaitAsync();
            try
            {
                if (_accessToken != null && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
                {
                    return _accessToken;
                }

                var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "client_credentials",
                    ["client_id"] = ClientId,
                    ["client_secret"] = ClientSecret
                });

                var response = await _httpClient.PostAsync($"{BaseUrl}/realms/{Realm}/protocol/openid-connect/token", content);
                response.EnsureSuccessStatusCode();

                var payload = await response.Content.ReadFromJsonAsync<TokenResponse>();
                _accessToken = payload?.AccessToken;
                _tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(payload?.ExpiresIn ?? 60);

                return _accessToken ?? string.Empty;
            }
            finally
            {
                _tokenLock.Release();
            }
        }

        private async Task<HttpRequestMessage> CreateAdminRequestAsync(HttpMethod method, string url)
        {
            var token = await GetAccessTokenAsync();
            var request = new HttpRequestMessage(method, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }

        public async Task<KeycloakUser?> GetUserAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}");
            using var response = await _httpClient.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<KeycloakUser>(JsonOptions);
        }

        public async Task<KeycloakUser?> FindUserByEmailAsync(string email)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}?email={Uri.EscapeDataString(email)}&exact=true");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            var users = await response.Content.ReadFromJsonAsync<List<KeycloakUser>>(JsonOptions) ?? new List<KeycloakUser>();
            return users.FirstOrDefault();
        }

        // События входа пользователя (нужна роль view-events у сервисного аккаунта — см. realm-импорт).
        public async Task<List<KeycloakLoginEvent>> GetUserLoginEventsAsync(string userId, int max = 25)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{BaseUrl}/admin/realms/{Realm}/events?user={Uri.EscapeDataString(userId)}&max={max}");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakLoginEvent>>(JsonOptions) ?? new List<KeycloakLoginEvent>();
        }

        /// <summary>
        /// Журнал входов всего realm — для экрана «Login history».
        ///
        /// Ходим служебным аккаунтом, а не токеном того, кто открыл страницу: у обычного
        /// администратора магазина нет ролей realm-management, и Keycloak отвечал ему 403.
        /// Право смотреть журнал даёт наша собственная роль admin, её проверяет контроллер.
        /// </summary>
        public async Task<List<SuperBot.Core.Interfaces.LoginEventRepresentation>> GetLoginEventsAsync(
            string? type = "LOGIN",
            int first = 0,
            int max = 100,
            string? user = null,
            string? client = null,
            string? dateFrom = null,
            string? dateTo = null)
        {
            // Окно и фильтры отдаём Keycloak: он умеет и то, и другое, а страница раньше
            // забирала пять сотен событий разом и отбирала нужные уже в браузере.
            var url = $"{BaseUrl}/admin/realms/{Realm}/events?first={first}&max={max}";
            if (!string.IsNullOrWhiteSpace(type))
            {
                url += $"&type={Uri.EscapeDataString(type)}";
            }
            if (!string.IsNullOrWhiteSpace(user))
            {
                url += $"&user={Uri.EscapeDataString(user)}";
            }
            if (!string.IsNullOrWhiteSpace(client))
            {
                url += $"&client={Uri.EscapeDataString(client)}";
            }
            if (!string.IsNullOrWhiteSpace(dateFrom))
            {
                url += $"&dateFrom={Uri.EscapeDataString(dateFrom)}";
            }
            if (!string.IsNullOrWhiteSpace(dateTo))
            {
                url += $"&dateTo={Uri.EscapeDataString(dateTo)}";
            }

            using var request = await CreateAdminRequestAsync(HttpMethod.Get, url);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<SuperBot.Core.Interfaces.LoginEventRepresentation>>(JsonOptions)
                   ?? new List<SuperBot.Core.Interfaces.LoginEventRepresentation>();
        }

        public async Task<List<KeycloakSession>> GetUserSessionsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}/sessions");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakSession>>(JsonOptions) ?? new List<KeycloakSession>();
        }

        public async Task<List<KeycloakCredential>> GetUserCredentialsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}/credentials");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakCredential>>(JsonOptions) ?? new List<KeycloakCredential>();
        }

        public async Task DeleteCredentialAsync(string userId, string credentialId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Delete, $"{AdminUsersPath}/{userId}/credentials/{credentialId}");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task LogoutAllSessionsAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Post, $"{AdminUsersPath}/{userId}/logout");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task LogoutSessionAsync(string sessionId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Delete, $"{BaseUrl}/admin/realms/{Realm}/sessions/{sessionId}");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        /// <summary>
        /// Язык пользователя в Keycloak (атрибут locale): на нём Keycloak шлёт свои письма (подтверждение почты,
        /// настройка 2FA, сброс пароля) и открывает свои страницы. Вызывается перед каждым таким письмом с языком
        /// сайта покупателя. Сбой не мешает действию — письмо уйдёт на языке realm по умолчанию.
        /// </summary>
        public async Task<bool> TrySetLocaleAsync(string userId, string? locale)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(locale))
            {
                return false;
            }

            try
            {
                var user = await GetUserAsync(userId);
                if (user is null)
                {
                    return false;
                }

                // Атрибуты в PUT заменяют все разом — остальные (если есть) сохраняем.
                var attributes = user.Attributes ?? new Dictionary<string, List<string>>();
                if (attributes.TryGetValue("locale", out var current) && current.FirstOrDefault() == locale)
                {
                    return true;
                }
                attributes["locale"] = new List<string> { locale };

                using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
                request.Content = JsonContent.Create(new { attributes });
                using var response = await _httpClient.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task SendVerifyEmailAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}/send-verify-email");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task ExecuteActionsEmailAsync(string userId, IEnumerable<string> actions, string? redirectUri = null, string? clientId = null)
        {
            var url = $"{AdminUsersPath}/{userId}/execute-actions-email";
            var query = new List<string>();
            if (!string.IsNullOrWhiteSpace(redirectUri))
            {
                query.Add($"redirect_uri={Uri.EscapeDataString(redirectUri)}");
            }
            if (!string.IsNullOrWhiteSpace(clientId))
            {
                query.Add($"client_id={Uri.EscapeDataString(clientId)}");
            }
            if (query.Count > 0)
            {
                url += "?" + string.Join("&", query);
            }

            using var request = await CreateAdminRequestAsync(HttpMethod.Put, url);
            request.Content = JsonContent.Create(actions);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task ResetPasswordAsync(string userId, string newPassword, bool temporary = false)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}/reset-password");
            request.Content = JsonContent.Create(new
            {
                type = "password",
                temporary,
                value = newPassword
            });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateEmailAsync(string userId, string email, bool emailVerified)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
            request.Content = JsonContent.Create(new { email, emailVerified });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        public async Task DisableUserAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
            request.Content = JsonContent.Create(new { enabled = false });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        /// <summary>Включить или выключить учётку. Выключенная не может войти, но данные и заказы остаются.</summary>
        /// <summary>Роли realm у пользователя — по ним видно, администратор он или покупатель.</summary>
        public async Task<List<string>> GetRealmRolesAsync(string userId)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, $"{AdminUsersPath}/{userId}/role-mappings/realm");
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            var roles = await response.Content.ReadFromJsonAsync<List<KeycloakRole>>(JsonOptions) ?? new List<KeycloakRole>();
            return roles.Select(role => role.Name).Where(name => !string.IsNullOrWhiteSpace(name)).ToList();
        }

        /// <summary>
        /// Кто ещё носит эту роль. Возвращает null, если Keycloak не дал ответа: на этот
        /// эндпоинт служебному аккаунту нужны права сверх управления пользователями, и в
        /// установках, где их не выдали, отличать «никого нет» от «не смогли посмотреть»
        /// обязательно — иначе проверка «последний администратор» решит наоборот.
        /// </summary>
        public async Task<List<KeycloakUser>?> TryGetRealmRoleUsersAsync(string roleName, int max = 100)
        {
            try
            {
                using var request = await CreateAdminRequestAsync(
                    HttpMethod.Get,
                    $"{BaseUrl}/admin/realms/{Realm}/roles/{Uri.EscapeDataString(roleName)}/users?max={max}");
                using var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }
                return await response.Content.ReadFromJsonAsync<List<KeycloakUser>>(JsonOptions);
            }
            catch (Exception)
            {
                return null;
            }
        }

        public async Task SetEnabledAsync(string userId, bool enabled)
        {
            using var request = await CreateAdminRequestAsync(HttpMethod.Put, $"{AdminUsersPath}/{userId}");
            request.Content = JsonContent.Create(new { enabled });
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }

        /// <summary>
        /// Поиск клиентов по подстроке (почта, имя, логин). Keycloak ищет по всем этим полям сам;
        /// лимит нужен, чтобы пустая строка не тянула весь realm.
        /// </summary>
        /// <summary>
        /// Страница списка учёток: first — сколько пропустить, enabled — только (раз)блокированные.
        /// Нужен фильтрам «Blocked» и «No orders» на экране клиентов: поиск для них не годится,
        /// там нет запроса — есть срез.
        /// </summary>
        public async Task<List<KeycloakUser>> ListUsersAsync(int first, int max, bool? enabled = null)
        {
            var url = $"{AdminUsersPath}?first={first}&max={max}&briefRepresentation=true";
            if (enabled.HasValue)
            {
                url += $"&enabled={(enabled.Value ? "true" : "false")}";
            }

            using var request = await CreateAdminRequestAsync(HttpMethod.Get, url);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakUser>>(JsonOptions) ?? new List<KeycloakUser>();
        }

        public async Task<List<KeycloakUser>> SearchUsersAsync(string query, int max = 20)
        {
            // Звёздочки вокруг запроса — поиск по вхождению: по умолчанию Keycloak ищет только
            // с начала поля, и «ova» не находил бы petrova@…, хотя по заказам такой человек
            // находится. Разное поведение двух половин одного поиска путало бы сильнее всего.
            var needle = string.IsNullOrWhiteSpace(query) ? query : $"*{query.Trim()}*";
            var url = $"{AdminUsersPath}?search={Uri.EscapeDataString(needle)}&max={max}&briefRepresentation=true";
            using var request = await CreateAdminRequestAsync(HttpMethod.Get, url);
            using var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<List<KeycloakUser>>(JsonOptions) ?? new List<KeycloakUser>();
        }

        /// <summary>
        /// Повторная проверка пароля (показ ключей, смена пароля, отключение 2FA). Идёт через закрытый
        /// клиент с секретом: парольный грант у публичного клиента витрины выключен, иначе пароли можно
        /// было бы перебирать прямо в token endpoint, минуя страницу входа. Неудачи считает защита
        /// Keycloak от перебора — так же, как попытки на странице входа.
        /// </summary>
        public async Task<bool> ValidatePasswordAsync(string username, string password)
        {
            if (string.IsNullOrWhiteSpace(ClientId) || string.IsNullOrWhiteSpace(ClientSecret))
            {
                return false;
            }

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = ClientId,
                ["client_secret"] = ClientSecret,
                ["username"] = username,
                ["password"] = password
            });

            using var response = await _httpClient.PostAsync($"{BaseUrl}/realms/{Realm}/protocol/openid-connect/token", content);
            return response.IsSuccessStatusCode;
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private sealed class TokenResponse
        {
            // Keycloak отдаёт snake_case; без атрибутов System.Text.Json не смаппит и токен будет пустым → 401.
            [JsonPropertyName("access_token")]
            public string AccessToken { get; set; } = string.Empty;

            [JsonPropertyName("expires_in")]
            public int ExpiresIn { get; set; }
        }
    }

    public sealed class KeycloakUser
    {
        public string Id { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool EmailVerified { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public bool Enabled { get; set; }
        public long? CreatedTimestamp { get; set; }
        /// <summary>Атрибуты пользователя; locale — язык его писем и страниц Keycloak.</summary>
        public Dictionary<string, List<string>>? Attributes { get; set; }
    }

    public sealed class KeycloakRole
    {
        public string Name { get; set; } = string.Empty;
    }

    public sealed class KeycloakLoginEvent
    {
        public long Time { get; set; }
        public string Type { get; set; } = string.Empty;
        public string? IpAddress { get; set; }
        public string? ClientId { get; set; }
        public Dictionary<string, string>? Details { get; set; }
    }

    public sealed class KeycloakSession
    {
        public string Id { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long Start { get; set; }
        public long LastAccess { get; set; }
        public string? Browser { get; set; }
        public string? Os { get; set; }
    }

    public sealed class KeycloakCredential
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public long? CreatedDate { get; set; }
        // JSON-строка с публичными метаданными credential (для recovery-кодов — totalCodes/remainingCodes)
        public string? CredentialData { get; set; }
    }
}
