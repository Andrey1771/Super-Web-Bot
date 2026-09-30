namespace SuperBot.WebApi.Services;

/// <summary>
/// Повторная проверка пароля вошедшего пользователя — перед показом ключей и другими
/// чувствительными действиями. Отдельный интерфейс, чтобы тесты подменяли Keycloak.
/// </summary>
public interface IPasswordVerifier
{
    Task<bool> VerifyAsync(string username, string password, CancellationToken ct = default);
}

/// <summary>Проверка паролем через Keycloak (grant password); сбой сети считается неверным паролем.</summary>
public sealed class KeycloakPasswordVerifier : IPasswordVerifier
{
    private readonly KeycloakAdminClient _keycloak;
    private readonly ILogger<KeycloakPasswordVerifier> _logger;

    public KeycloakPasswordVerifier(KeycloakAdminClient keycloak, ILogger<KeycloakPasswordVerifier> logger)
    {
        _keycloak = keycloak;
        _logger = logger;
    }

    public async Task<bool> VerifyAsync(string username, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            return false;
        }
        try
        {
            return await _keycloak.ValidatePasswordAsync(username, password);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Keycloak is unreachable while verifying a password for {User}", username);
            return false;
        }
    }
}
