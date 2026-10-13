using System.Collections.Concurrent;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Подменяет обращения к Stripe в тестах: намерения живут в памяти.
/// Настоящий шлюз ходит в сеть, поэтому пайплайн без этой подмены не протестировать.
/// </summary>
public class FakeStripePaymentIntentGateway : IStripePaymentIntentGateway
{
    private readonly ConcurrentDictionary<string, PaymentIntentSnapshot> _intents = new();
    private int _counter;

    /// <summary>Сколько раз реально создавалось намерение — так проверяется переиспользование.</summary>
    public int CreateCount;

    /// <summary>Идемпотентные ключи, с которыми приходили запросы на создание.</summary>
    public readonly ConcurrentBag<string> IdempotencyKeys = new();

    /// <summary>Намерения, по которым запрашивался возврат, — с ключами идемпотентности.</summary>
    public readonly ConcurrentDictionary<string, string> RefundedIntents = new();

    /// <summary>Валюта выплат аккаунта. По умолчанию доллар; null — как будто Stripe не ответил.</summary>
    public volatile string? SettlementCurrency = "USD";

    public Task<string?> GetSettlementCurrencyAsync() => Task.FromResult(SettlementCurrency);

    public Task<PaymentIntentSnapshot?> GetAsync(string paymentIntentId)
    {
        _intents.TryGetValue(paymentIntentId, out var intent);
        return Task.FromResult(intent);
    }

    public Task<PaymentIntentSnapshot> CreateAsync(PaymentIntentDraft draft, string idempotencyKey)
    {
        Interlocked.Increment(ref CreateCount);
        IdempotencyKeys.Add(idempotencyKey);

        // Настоящий Stripe по тому же ключу вернул бы то же намерение — воспроизводим это.
        var existing = _intents.Values.FirstOrDefault(item => item.MetadataValue("__idempotency") == idempotencyKey);
        if (existing != null)
        {
            return Task.FromResult(existing);
        }

        var id = $"pi_test_{Interlocked.Increment(ref _counter)}";
        var metadata = new Dictionary<string, string>(draft.Metadata) { ["__idempotency"] = idempotencyKey };

        var intent = new PaymentIntentSnapshot
        {
            Id = id,
            Status = "requires_payment_method",
            Currency = draft.Currency,
            Amount = draft.AmountMinorUnits,
            AmountReceived = 0,
            ClientSecret = $"{id}_secret_test",
            Metadata = metadata,
            CustomerId = draft.CustomerId
        };

        _intents[id] = intent;
        return Task.FromResult(intent);
    }

    public Task<PaymentIntentSnapshot?> UpdateAsync(string paymentIntentId, PaymentIntentDraft draft)
    {
        if (!_intents.TryGetValue(paymentIntentId, out var intent))
        {
            return Task.FromResult<PaymentIntentSnapshot?>(null);
        }

        intent.Amount = draft.AmountMinorUnits;
        intent.Currency = draft.Currency;
        intent.CustomerId = draft.CustomerId ?? intent.CustomerId;
        foreach (var pair in draft.Metadata)
        {
            intent.Metadata[pair.Key] = pair.Value;
        }

        return Task.FromResult<PaymentIntentSnapshot?>(intent);
    }

    /// <summary>Все запросы возврата по порядку: ключ идемпотентности и сумма (null — весь остаток).</summary>
    public readonly ConcurrentQueue<(string PaymentIntentId, string IdempotencyKey, long? AmountMinor)> Refunds = new();

    /// <summary>true — Stripe отклоняет возвраты (как при заблокированном аккаунте); намерения при этом работают.</summary>
    public volatile bool FailRefunds;

    public Task<bool> RefundPaymentIntentAsync(string paymentIntentId, string idempotencyKey, long? amountMinorUnits = null)
    {
        if (FailRefunds)
        {
            return Task.FromResult(false);
        }
        RefundedIntents[paymentIntentId] = idempotencyKey;
        Refunds.Enqueue((paymentIntentId, idempotencyKey, amountMinorUnits));
        return Task.FromResult(true);
    }

    /// <summary>Имитирует успешную оплату покупателем.</summary>
    public void MarkSucceeded(string paymentIntentId, string? billingCountry = null, string? cardCountry = null, string brand = "visa", string last4 = "4242", string? wallet = null)
    {
        if (_intents.TryGetValue(paymentIntentId, out var intent))
        {
            intent.Status = "succeeded";
            intent.AmountReceived = intent.Amount;
            // Форма карты спрашивает страну сама — так она и доезжает до налога.
            intent.BillingCountry = billingCountry;
            intent.CardCountry = cardCountry;
            // Как настоящий Stripe в latest_charge: чем заплатили.
            intent.PaymentMethodType = "card";
            intent.CardBrand = brand;
            intent.CardLast4 = last4;
            intent.CardWallet = wallet;
        }
    }
}
