using System.Security.Cryptography;
using System.Text;

namespace SuperBot.WebApi.Services.ReviewInvites;

/// <summary>
/// Ссылка «больше не звать меня писать отзывы» — подписанный адрес, без хранения токенов.
///
/// Токен в базе тут не нужен и вреден: письмо уходит и гостю, у которого нет аккаунта, а
/// таблица одноразовых ссылок для отписки — лишняя сущность, которую надо чистить. HMAC от
/// самой почты решает задачу целиком: подделать нельзя, а по ссылке видно, кого отписывать.
///
/// Срока годности намеренно нет. Отписка не должна протухать: человек мог найти письмо
/// через год, и «ссылка устарела» в ответ на просьбу не писать — издевательство.
/// </summary>
public interface IReviewInviteTokenService
{
    string CreateToken(string email);
    bool TryValidate(string token, out string email);
}

public class ReviewInviteTokenService : IReviewInviteTokenService
{
    private const int SignatureHexLength = 64; // SHA256 → 32 байта → 64 hex-символа

    private readonly byte[] _secret;

    public ReviewInviteTokenService(IConfiguration configuration)
    {
        // Свой секрет, если задан; иначе тот же JWT-секрет, что уже есть во всех окружениях.
        var secret = configuration["ReviewInvites:TokenSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            secret = configuration["JwtSettings:SecretKey"];
        }

        if (string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException(
                "Review invites need ReviewInvites:TokenSecret or JwtSettings:SecretKey to be configured.");
        }

        _secret = Encoding.UTF8.GetBytes(secret);
    }

    public string CreateToken(string email)
    {
        var payloadBytes = Encoding.UTF8.GetBytes(Normalize(email));
        var payloadHex = Convert.ToHexString(payloadBytes).ToLowerInvariant();
        var signatureHex = Convert.ToHexString(HMACSHA256.HashData(_secret, payloadBytes)).ToLowerInvariant();
        return payloadHex + signatureHex;
    }

    public bool TryValidate(string token, out string email)
    {
        email = string.Empty;

        if (string.IsNullOrWhiteSpace(token) || token.Length <= SignatureHexLength)
        {
            return false;
        }

        var payloadHex = token[..^SignatureHexLength];
        var signatureHex = token[^SignatureHexLength..];

        byte[] payloadBytes;
        try
        {
            payloadBytes = Convert.FromHexString(payloadHex);
        }
        catch (FormatException)
        {
            return false;
        }

        var expected = Convert.ToHexString(HMACSHA256.HashData(_secret, payloadBytes)).ToLowerInvariant();

        // Сравнение постоянного времени: обычное == на подписи утекает их содержимое по таймингу.
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expected),
                Encoding.ASCII.GetBytes(signatureHex.ToLowerInvariant())))
        {
            return false;
        }

        var value = Encoding.UTF8.GetString(payloadBytes);
        if (!value.Contains('@'))
        {
            return false;
        }

        email = value;
        return true;
    }

    public static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
