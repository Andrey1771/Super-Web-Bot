using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Verifies a Cloudflare Turnstile token server-side (the bot check applied when a chat session is
/// created). Fail-open when no secret is configured, so the chat keeps working until keys are set.
/// </summary>
public interface ITurnstileVerifier
{
    bool Enabled { get; }

    Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken cancellationToken);
}

public class TurnstileVerifier : ITurnstileVerifier
{
    private const string VerifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private readonly HttpClient _httpClient;
    private readonly SupportChatOptions _options;
    private readonly ILogger<TurnstileVerifier> _logger;

    public TurnstileVerifier(HttpClient httpClient, IOptions<SupportChatOptions> options, ILogger<TurnstileVerifier> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_options.TurnstileSecretKey);

    public async Task<bool> VerifyAsync(string? token, string? remoteIp, CancellationToken cancellationToken)
    {
        if (!Enabled)
        {
            return true; // verification disabled
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        try
        {
            var form = new List<KeyValuePair<string, string>>
            {
                new("secret", _options.TurnstileSecretKey!),
                new("response", token)
            };
            if (!string.IsNullOrWhiteSpace(remoteIp) && remoteIp != "unknown")
            {
                form.Add(new("remoteip", remoteIp));
            }

            using var response = await _httpClient.PostAsync(VerifyUrl, new FormUrlEncodedContent(form), cancellationToken);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<TurnstileResponse>(cancellationToken: cancellationToken);
            if (result?.Success != true)
            {
                _logger.LogInformation("Turnstile verification failed: {Errors}", string.Join(",", result?.ErrorCodes ?? Array.Empty<string>()));
            }

            return result?.Success ?? false;
        }
        catch (Exception ex)
        {
            // If Cloudflare is unreachable, don't hard-block legitimate users on a transient outage.
            _logger.LogWarning(ex, "Turnstile verification request failed; allowing the request.");
            return true;
        }
    }

    private sealed class TurnstileResponse
    {
        [JsonPropertyName("success")] public bool Success { get; set; }

        [JsonPropertyName("error-codes")] public string[]? ErrorCodes { get; set; }
    }
}
