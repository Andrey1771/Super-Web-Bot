using SuperBot.WebApi.Services;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>Вместо Keycloak: верен ровно один пароль, общий для всех тестовых пользователей.</summary>
public sealed class FakePasswordVerifier : IPasswordVerifier
{
    public const string CorrectPassword = "correct-horse-battery";

    public Task<bool> VerifyAsync(string username, string password, CancellationToken ct = default) =>
        Task.FromResult(!string.IsNullOrWhiteSpace(username) && password == CorrectPassword);
}
