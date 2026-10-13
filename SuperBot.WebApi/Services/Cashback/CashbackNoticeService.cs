using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Cashback;
using SuperBot.Infrastructure.Data;
using SuperBot.Infrastructure.Services;
using SuperBot.WebApi.Mail;

namespace SuperBot.WebApi.Services.Cashback;

/// <summary>
/// Письма о кэшбэке, раз в сутки:
///  - «стал доступен» — начисление закончило срок ожидания (одно письмо на все разблокированные за прогон);
///  - «скоро сгорит» — у пополнения баланса остался непотраченный остаток, а до сгорания меньше ExpiryReminderDays.
///
/// Ровно одно письмо на каждое начисление и каждое сгорание: отметка в <c>CashbackNotices</c> ставится ДО отправки
/// и держится уникальным индексом — при сбое SMTP лучше не написать, чем написать дважды.
///
/// Общая отписка от рассылки здесь не учитывается: это не реклама, а сообщения о деньгах на балансе покупателя.
/// От них есть своя отписка — ссылкой из письма.
/// </summary>
public sealed class CashbackNoticeService
{
    public const string NoticesCollection = "CashbackNotices";
    public const string OptOutsCollection = "CashbackNoticeOptOuts";

    /// <summary>
    /// Разблокировки старше не объявляем: иначе после включения писем (или простоя задачи) люди получили бы письма
    /// о кэшбэке, который давно лежит на балансе и, возможно, уже потрачен.
    /// </summary>
    private static readonly TimeSpan UnlockLookback = TimeSpan.FromDays(3);

    private readonly IMongoDatabase _database;
    private readonly ICashbackLedger _ledger;
    private readonly ICashbackCurrency _currency;
    private readonly ICashbackNoticeMailer _mailer;
    private readonly SuperBot.Core.Interfaces.IRepositories.IOrderRepository _orders;
    private readonly CashbackNoticeTokens _tokens;
    private readonly IOptionsMonitor<CashbackOptions> _options;
    private readonly MailOptions _mailOptions;
    private readonly ILogger<CashbackNoticeService> _logger;

    public CashbackNoticeService(
        IMongoDatabase database,
        ICashbackLedger ledger,
        ICashbackCurrency currency,
        ICashbackNoticeMailer mailer,
        SuperBot.Core.Interfaces.IRepositories.IOrderRepository orders,
        CashbackNoticeTokens tokens,
        IOptionsMonitor<CashbackOptions> options,
        IOptions<MailOptions> mailOptions,
        ILogger<CashbackNoticeService> logger)
    {
        _database = database;
        _ledger = ledger;
        _currency = currency;
        _mailer = mailer;
        _orders = orders;
        _tokens = tokens;
        _options = options;
        _mailOptions = mailOptions.Value;
        _logger = logger;
    }

    private IMongoCollection<CashbackNoticeDb> Notices => _database.GetCollection<CashbackNoticeDb>(NoticesCollection);
    private IMongoCollection<CashbackNoticeOptOutDb> OptOuts => _database.GetCollection<CashbackNoticeOptOutDb>(OptOutsCollection);

    /// <summary>Точка входа расписания. Результат видят тесты и логи.</summary>
    public async Task<CashbackNoticeRunResult> RunAsync(CancellationToken ct = default)
    {
        var options = _options.CurrentValue;
        // Выключенная программа — тратить кэшбэк нельзя, и звать тратить его незачем.
        if (!options.Enabled || !options.EmailNotices)
        {
            return CashbackNoticeRunResult.Disabled;
        }

        var now = DateTime.UtcNow;
        // Снимок баланса в счёте может отставать (ожидающее разблокируется без записи), поэтому берём всех,
        // у кого есть хоть что-то: и доступное, и ожидающее.
        var accounts = await _database.GetCollection<CashbackAccountDb>("CashbackAccounts")
            .Find(Builders<CashbackAccountDb>.Filter.Or(
                Builders<CashbackAccountDb>.Filter.Gt(item => item.AvailableUsd, 0m),
                Builders<CashbackAccountDb>.Filter.Gt(item => item.PendingUsd, 0m)))
            .Project(item => item.UserKey)
            .ToListAsync(ct);

        var optedOut = await OptedOutAsync(accounts, ct);
        var result = new CashbackNoticeRunResult(true, 0, 0, 0);

        foreach (var userKey in accounts)
        {
            if (ct.IsCancellationRequested)
            {
                break;
            }
            var email = CashbackNoticeTokens.Normalize(userKey);
            if (!email.Contains('@') || optedOut.Contains(email))
            {
                continue;
            }

            try
            {
                result = result.Add(await NotifyUserAsync(userKey, email, now, options, ct));
            }
            catch (Exception ex)
            {
                result = result with { Failed = result.Failed + 1 };
                _logger.LogWarning(ex, "Cashback notices for {UserKey} failed.", userKey);
            }
        }

        if (result.Available + result.Expiring + result.Failed > 0)
        {
            _logger.LogInformation("Cashback notices: {Available} available, {Expiring} expiring, {Failed} failed.",
                result.Available, result.Expiring, result.Failed);
        }
        return result;
    }

    private async Task<string?> CustomerLanguageAsync(string userKey)
    {
        try
        {
            return SuperBot.WebApi.Services.BuyerLanguage.FromOrders(await _orders.GetOrdersByUserAsync(userKey));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Customer language for cashback notices of {UserKey} could not be read.", userKey);
            return null;
        }
    }

    private async Task<CashbackNoticeRunResult> NotifyUserAsync(string userKey, string email, DateTime now, CashbackOptions options, CancellationToken ct)
    {
        var entries = await _ledger.GetEntriesAsync(userKey);
        var summary = CashbackProjection.Project(entries, now);
        var currency = NoticeCurrency(entries);
        var unsubscribe = UnsubscribeUrl(email);
        // Язык письма — язык последнего заказа покупателя; заказов с языком нет — английский.
        var locale = await CustomerLanguageAsync(userKey);
        var result = new CashbackNoticeRunResult(true, 0, 0, 0);

        // Стал доступен: разблокировался за последние дни и ещё не потрачен.
        var unlocked = entries
            .Where(entry => entry.Type == CashbackEntryTypes.Earn && entry.Id != null
                            && entry.UnlocksAt is { } at && at <= now && at > now - UnlockLookback
                            && summary.Earns.TryGetValue(entry.Id, out var state) && state.RemainingUsd > 0)
            .ToList();
        var claimedUnlocks = new List<decimal>();
        foreach (var entry in unlocked)
        {
            if (await TryClaimAsync($"available:{entry.Id}", email, now, ct))
            {
                claimedUnlocks.Add(summary.Earns[entry.Id!].RemainingUsd);
            }
        }
        if (claimedUnlocks.Count > 0)
        {
            var nextExpiry = summary.Lots
                .Where(lot => lot.Unlocked && lot.RemainingUsd > 0 && lot.ExpiresAt > now)
                .Min(lot => lot.ExpiresAt);
            var sent = await SendSafelyAsync(() => _mailer.SendAvailableAsync(email,
                Money(claimedUnlocks.Sum(), currency), Money(summary.AvailableUsd, currency), nextExpiry, unsubscribe, locale, ct));
            result = sent ? result with { Available = 1 } : result with { Failed = result.Failed + 1 };
        }

        // Скоро сгорит: у разблокированного пополнения остался остаток, до сгорания меньше срока напоминания.
        if (options.ExpiryReminderDays > 0)
        {
            var horizon = now.AddDays(options.ExpiryReminderDays);
            var expiring = summary.Lots
                .Where(lot => lot.Unlocked && lot.RemainingUsd > 0 && lot.ExpiresAt is { } at && at > now && at <= horizon)
                .OrderBy(lot => lot.ExpiresAt)
                .ToList();
            var claimed = new List<CashbackLotState>();
            foreach (var lot in expiring)
            {
                if (await TryClaimAsync($"expiring:{lot.Key}", email, now, ct))
                {
                    claimed.Add(lot);
                }
            }
            if (claimed.Count > 0)
            {
                // В письме — ближайшая дата и всё, что сгорит к ней и в пределах того же окна напоминания.
                var sent = await SendSafelyAsync(() => _mailer.SendExpiringAsync(email,
                    Money(claimed.Sum(lot => lot.RemainingUsd), currency), claimed[0].ExpiresAt!.Value,
                    Money(summary.AvailableUsd, currency), unsubscribe, locale, ct));
                result = sent ? result with { Expiring = 1 } : result with { Failed = result.Failed + 1 };
            }
        }

        return result;
    }

    /// <summary>«Не присылать письма о кэшбэке» по ссылке из письма. Повторный переход безопасен.</summary>
    public async Task<bool> OptOutAsync(string token, CancellationToken ct = default)
    {
        if (!_tokens.TryValidate(token, out var email))
        {
            return false;
        }

        await OptOuts.UpdateOneAsync(
            Builders<CashbackNoticeOptOutDb>.Filter.Eq(row => row.Email, email),
            Builders<CashbackNoticeOptOutDb>.Update
                .SetOnInsert(row => row.Email, email)
                .SetOnInsert(row => row.CreatedAtUtc, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true },
            ct);
        return true;
    }

    private async Task<bool> SendSafelyAsync(Func<Task> send)
    {
        try
        {
            await send();
            return true;
        }
        catch (Exception ex)
        {
            // Отметку не снимаем: повтор письма хуже, чем его отсутствие.
            _logger.LogWarning(ex, "Cashback notice email could not be sent.");
            return false;
        }
    }

    /// <summary>Валюта последнего заказа с начислением, если для неё есть курс; иначе доллары — в них хранится баланс.</summary>
    private string NoticeCurrency(IReadOnlyList<CashbackEntry> entries)
    {
        var currency = entries
            .Where(entry => entry.Type == CashbackEntryTypes.Earn && !string.IsNullOrWhiteSpace(entry.OrderCurrency))
            .OrderByDescending(entry => entry.CreatedAt)
            .Select(entry => entry.OrderCurrency!.ToUpperInvariant())
            .FirstOrDefault() ?? "USD";
        return _currency.FromUsd(1m, currency) == null ? "USD" : currency;
    }

    private CashbackNoticeMoney Money(decimal usd, string currency) =>
        new(currency == "USD" ? CashbackProjection.Round(usd) : _currency.FromUsd(usd, currency) ?? usd, currency);

    private string UnsubscribeUrl(string email)
    {
        var baseUrl = string.IsNullOrWhiteSpace(_mailOptions.PublicBaseUrl) ? string.Empty : _mailOptions.PublicBaseUrl.TrimEnd('/');
        return $"{baseUrl}/cashback/unsubscribe?token={_tokens.CreateToken(email)}";
    }

    private async Task<HashSet<string>> OptedOutAsync(IEnumerable<string> userKeys, CancellationToken ct)
    {
        var emails = userKeys.Select(CashbackNoticeTokens.Normalize).Distinct(StringComparer.Ordinal).ToList();
        if (emails.Count == 0)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }
        var rows = await OptOuts.Find(Builders<CashbackNoticeOptOutDb>.Filter.In(row => row.Email, emails))
            .Project(row => row.Email)
            .ToListAsync(ct);
        return new HashSet<string>(rows, StringComparer.Ordinal);
    }

    private async Task<bool> TryClaimAsync(string key, string email, DateTime now, CancellationToken ct)
    {
        try
        {
            await Notices.InsertOneAsync(new CashbackNoticeDb { Key = key, Email = email, SentAtUtc = now }, cancellationToken: ct);
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return false;
        }
    }
}

public sealed record CashbackNoticeRunResult(bool Enabled, int Available, int Expiring, int Failed)
{
    public static readonly CashbackNoticeRunResult Disabled = new(false, 0, 0, 0);

    public CashbackNoticeRunResult Add(CashbackNoticeRunResult other) =>
        this with { Available = Available + other.Available, Expiring = Expiring + other.Expiring, Failed = Failed + other.Failed };
}

/// <summary>
/// Подписанная ссылка отписки: HMAC от почты, без хранения токенов и без срока годности — как у приглашений к отзывам.
/// Своё назначение в подписи, чтобы ссылка из письма об отзывах не отписывала от кэшбэка и наоборот.
/// </summary>
public sealed class CashbackNoticeTokens
{
    private const string Purpose = "cashback-notices:";
    private const int SignatureHexLength = 64;
    private readonly byte[] _secret;

    public CashbackNoticeTokens(IConfiguration configuration)
    {
        var secret = configuration["ReviewInvites:TokenSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            secret = configuration["JwtSettings:SecretKey"];
        }
        if (string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException("Cashback notices need ReviewInvites:TokenSecret or JwtSettings:SecretKey to be configured.");
        }
        _secret = Encoding.UTF8.GetBytes(secret);
    }

    public string CreateToken(string email)
    {
        var payload = Encoding.UTF8.GetBytes(Normalize(email));
        return Convert.ToHexString(payload).ToLowerInvariant() + Sign(payload);
    }

    public bool TryValidate(string token, out string email)
    {
        email = string.Empty;
        if (string.IsNullOrWhiteSpace(token) || token.Length <= SignatureHexLength)
        {
            return false;
        }

        byte[] payload;
        try
        {
            payload = Convert.FromHexString(token[..^SignatureHexLength]);
        }
        catch (FormatException)
        {
            return false;
        }

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(Sign(payload)),
                Encoding.ASCII.GetBytes(token[^SignatureHexLength..].ToLowerInvariant())))
        {
            return false;
        }

        var value = Encoding.UTF8.GetString(payload);
        if (!value.Contains('@'))
        {
            return false;
        }
        email = value;
        return true;
    }

    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    private string Sign(byte[] payload) =>
        Convert.ToHexString(HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes(Purpose).Concat(payload).ToArray())).ToLowerInvariant();
}

public class CashbackNoticeDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>available:{id начисления} или expiring:{id пополнения}. Уникальный индекс — одно письмо на событие.</summary>
    public string Key { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime SentAtUtc { get; set; }
}

public class CashbackNoticeOptOutDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}
