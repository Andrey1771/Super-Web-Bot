using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace SuperBot.Infrastructure.Services
{
    /// <summary>
    /// Токены для ссылки «подтвердите почту — получите ключи» (гостевая покупка).
    /// Без хранения в БД: полезная нагрузка (orderId|email|expiry) подписана HMAC-SHA256.
    /// Повтор перехода по ссылке безопасен — выдача ключей идемпотентна.
    /// Формат — сплошной hex (payloadHex + 64 символа подписи), чтобы токен целиком
    /// переживал почтовые клиенты и копирование.
    /// </summary>
    public interface IDeliveryVerificationTokenService
    {
        string CreateToken(Guid orderId, string email, TimeSpan lifetime);
        bool TryValidate(string token, out Guid orderId, out string email);
    }

    public class DeliveryVerificationTokenService : IDeliveryVerificationTokenService
    {
        private const int SignatureHexLength = 64; // SHA256 → 32 байта → 64 hex-символа

        private readonly byte[] _secret;

        public DeliveryVerificationTokenService(IConfiguration configuration)
        {
            // Свой секрет, если задан; иначе переиспользуем JWT-секрет (он уже есть во всех окружениях).
            var secret = configuration["Delivery:TokenSecret"];
            if (string.IsNullOrWhiteSpace(secret))
            {
                secret = configuration["JwtSettings:SecretKey"];
            }

            if (string.IsNullOrWhiteSpace(secret))
            {
                throw new InvalidOperationException("Delivery verification needs Delivery:TokenSecret or JwtSettings:SecretKey to be configured.");
            }

            _secret = Encoding.UTF8.GetBytes(secret);
        }

        public string CreateToken(Guid orderId, string email, TimeSpan lifetime)
        {
            var expiresAt = DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds();
            var payload = $"{orderId:N}|{email.Trim().ToLowerInvariant()}|{expiresAt}";
            var payloadBytes = Encoding.UTF8.GetBytes(payload);

            var payloadHex = Convert.ToHexString(payloadBytes).ToLowerInvariant();
            var signatureHex = Convert.ToHexString(HMACSHA256.HashData(_secret, payloadBytes)).ToLowerInvariant();

            return payloadHex + signatureHex;
        }

        public bool TryValidate(string token, out Guid orderId, out string email)
        {
            orderId = Guid.Empty;
            email = string.Empty;

            if (string.IsNullOrWhiteSpace(token) || token.Length <= SignatureHexLength)
            {
                return false;
            }

            byte[] payloadBytes;
            byte[] providedSignature;
            try
            {
                payloadBytes = Convert.FromHexString(token[..^SignatureHexLength]);
                providedSignature = Convert.FromHexString(token[^SignatureHexLength..]);
            }
            catch (FormatException)
            {
                return false;
            }

            var expectedSignature = HMACSHA256.HashData(_secret, payloadBytes);
            if (!CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature))
            {
                return false;
            }

            var parts = Encoding.UTF8.GetString(payloadBytes).Split('|');
            if (parts.Length != 3
                || !Guid.TryParseExact(parts[0], "N", out orderId)
                || !long.TryParse(parts[2], out var expiresAt))
            {
                return false;
            }

            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expiresAt)
            {
                return false;
            }

            email = parts[1];
            return true;
        }
    }
}
