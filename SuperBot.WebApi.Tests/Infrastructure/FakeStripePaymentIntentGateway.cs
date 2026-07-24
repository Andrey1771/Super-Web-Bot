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
            Metadata = metadata
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
        foreach (var pair in draft.Metadata)
        {
            intent.Metadata[pair.Key] = pair.Value;
        }

        return Task.FromResult<PaymentIntentSnapshot?>(intent);
    }

    /// <summary>Имитирует успешную оплату покупателем.</summary>
    public void MarkSucceeded(string paymentIntentId)
    {
        if (_intents.TryGetValue(paymentIntentId, out var intent))
        {
            intent.Status = "succeeded";
            intent.AmountReceived = intent.Amount;
        }
    }
}
