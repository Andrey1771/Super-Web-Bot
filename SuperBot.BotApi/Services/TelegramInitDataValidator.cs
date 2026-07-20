using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SuperBot.BotApi.Services
{
    public sealed record TelegramInitDataUser(long UserId, string? Username, string? FirstName);

    /// <summary>
    /// Проверка подлинности Telegram Mini App initData по алгоритму Telegram
    /// (HMAC-SHA256, ключ выводится из токена бота). Гарантирует, что данные пришли из Telegram.
    /// </summary>
    public sealed class TelegramInitDataValidator
    {
        public TelegramInitDataUser? Validate(string initData, string botToken, TimeSpan? maxAge = null)
        {
            if (string.IsNullOrWhiteSpace(initData) || string.IsNullOrWhiteSpace(botToken))
            {
                return null;
            }

            var pairs = initData
                .Split('&', StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Split('=', 2))
                .Where(part => part.Length == 2)
                .ToDictionary(part => part[0], part => part[1], StringComparer.Ordinal);

            if (!pairs.TryGetValue("hash", out var providedHash) || string.IsNullOrWhiteSpace(providedHash))
            {
                return null;
            }

            // data_check_string: все поля кроме hash, значения URL-декодированы, ключи по алфавиту, через \n.
            var dataCheckString = string.Join('\n', pairs
                .Where(pair => pair.Key != "hash")
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => $"{pair.Key}={Uri.UnescapeDataString(pair.Value)}"));

            // secret = HMAC_SHA256(key="WebAppData", message=botToken)
            var secretKey = HMACSHA256.HashData(Encoding.UTF8.GetBytes("WebAppData"), Encoding.UTF8.GetBytes(botToken));
            var computed = HMACSHA256.HashData(secretKey, Encoding.UTF8.GetBytes(dataCheckString));

            byte[] providedBytes;
            try
            {
                providedBytes = Convert.FromHexString(providedHash);
            }
            catch
            {
                return null;
            }

            if (!CryptographicOperations.FixedTimeEquals(computed, providedBytes))
            {
                return null;
            }

            // Защита от переигрывания: initData не старше maxAge (если задан).
            if (maxAge.HasValue && pairs.TryGetValue("auth_date", out var authDateRaw)
                && long.TryParse(authDateRaw, out var authUnix))
            {
                var authDate = DateTimeOffset.FromUnixTimeSeconds(authUnix);
                if (DateTimeOffset.UtcNow - authDate > maxAge.Value)
                {
                    return null;
                }
            }

            if (!pairs.TryGetValue("user", out var userJsonEncoded))
            {
                return null;
            }

            try
            {
                using var document = JsonDocument.Parse(Uri.UnescapeDataString(userJsonEncoded));
                var root = document.RootElement;
                var userId = root.GetProperty("id").GetInt64();
                var username = root.TryGetProperty("username", out var u) ? u.GetString() : null;
                var firstName = root.TryGetProperty("first_name", out var f) ? f.GetString() : null;
                return new TelegramInitDataUser(userId, username, firstName);
            }
            catch
            {
                return null;
            }
        }
    }
}
