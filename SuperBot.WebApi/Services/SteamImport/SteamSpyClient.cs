using System.Text.Json;

namespace SuperBot.WebApi.Services.SteamImport;

public interface ISteamSpyClient
{
    /// <summary>
    /// Пользовательские метки игры (Horror, Roguelike, Co-op…) по убыванию голосов. Steam в appdetails
    /// их не отдаёт, а без них не отличить хоррор или головоломку от просто «Action». Пустой список —
    /// SteamSpy недоступен или меток нет: импорт продолжается без них.
    /// </summary>
    Task<IReadOnlyList<string>> GetTagsAsync(string appId, CancellationToken ct);
}

/// <summary>
/// SteamSpy (steamspy.com) — неофициальная статистика Steam. Лимит — запрос в секунду; сервис
/// сторонний, поэтому любая ошибка здесь не мешает импорту.
/// </summary>
public sealed class SteamSpyClient(HttpClient http, ILogger<SteamSpyClient> logger) : ISteamSpyClient
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime _nextRequestUtc = DateTime.MinValue;

    internal static TimeSpan RequestInterval { get; set; } = TimeSpan.FromSeconds(1.1);

    public async Task<IReadOnlyList<string>> GetTagsAsync(string appId, CancellationToken ct)
    {
        try
        {
            await Gate.WaitAsync(ct);
            string body;
            try
            {
                var wait = _nextRequestUtc - DateTime.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    await Task.Delay(wait, ct);
                }
                body = await http.GetStringAsync($"https://steamspy.com/api.php?request=appdetails&appid={Uri.EscapeDataString(appId)}", ct);
            }
            finally
            {
                _nextRequestUtc = DateTime.UtcNow + RequestInterval;
                Gate.Release();
            }
            return ParseTags(body);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogWarning("SteamSpy tags unavailable for app {AppId}: {Message}", appId, ex.Message);
            return [];
        }
    }

    /// <summary>«tags»: {"Open World": 4321, …} или [] — когда меток нет.</summary>
    public static IReadOnlyList<string> ParseTags(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("tags", out var tags) || tags.ValueKind != JsonValueKind.Object)
        {
            return [];
        }
        return tags.EnumerateObject()
            .Select(p => (Name: p.Name.Trim(), Votes: p.Value.ValueKind == JsonValueKind.Number && p.Value.TryGetInt32(out var v) ? v : 0))
            .Where(t => t.Name.Length > 0)
            .OrderByDescending(t => t.Votes)
            .Select(t => t.Name)
            .ToList();
    }
}
