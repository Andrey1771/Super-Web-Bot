namespace SuperBot.WebApi.Services;

/// <summary>
/// Кто читатель поста для подсчёта уникальных: вошедший — по пользователю, гость — по anonId,
/// без того и другого — по сессии. Один ключ на все счётчики блога и аналитику админки.
/// </summary>
public static class BlogActorKey
{
    public static string For(string? userId, string? anonId, string? sessionId)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            return $"u:{userId}";
        }
        if (!string.IsNullOrWhiteSpace(anonId))
        {
            return $"a:{anonId}";
        }
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            return $"s:{sessionId}";
        }
        return string.Empty;
    }
}
