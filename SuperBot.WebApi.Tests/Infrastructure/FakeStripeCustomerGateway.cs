using System.Collections.Concurrent;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Подменяет обращения к Stripe за клиентом и картами: всё живёт в памяти.
///
/// Главное, что этот двойник умеет и чего нельзя добиться от настоящего Stripe, — считать
/// обращения. Смысл правки в том, что кабинет БОЛЬШЕ НЕ ходит наружу, когда карт нет, а
/// «не ходит» проверяется только счётчиком.
/// </summary>
public class FakeStripeCustomerGateway : IStripeCustomerGateway
{
    private int _counter;

    /// <summary>Карты по идентификатору. CustomerId в снимке — владелец.</summary>
    public readonly ConcurrentDictionary<string, StripeCardSnapshot> Cards = new();

    /// <summary>Карта по умолчанию у клиента.</summary>
    public readonly ConcurrentDictionary<string, string?> Defaults = new();

    /// <summary>Сколько клиентов реально создано — так ловится создание «на каждый заход».</summary>
    public int CreateCustomerCount;

    /// <summary>Ключи идемпотентности, с которыми приходили запросы на создание.</summary>
    public readonly ConcurrentBag<string> IdempotencyKeys = new();

    /// <summary>Любое обращение наружу. Ноль означает, что в Stripe не ходили вовсе.</summary>
    public int CallCount;

    /// <summary>Отвязанные карты — по ним видно, дошёл ли detach до Stripe.</summary>
    public readonly ConcurrentBag<string> DetachedCards = new();

    public void Reset()
    {
        Cards.Clear();
        Defaults.Clear();
        DetachedCards.Clear();
        IdempotencyKeys.Clear();
        CreateCustomerCount = 0;
        CallCount = 0;
    }

    /// <summary>Кладёт карту так, как будто её привязали через Stripe.</summary>
    public StripeCardSnapshot GivenCard(string customerId, string? id = null)
    {
        var card = new StripeCardSnapshot
        {
            Id = id ?? $"pm_{Guid.NewGuid():N}",
            CustomerId = customerId,
            Brand = "visa",
            Last4 = "4242",
            ExpMonth = 12,
            ExpYear = 2030
        };
        Cards[card.Id] = card;
        return card;
    }

    public Task<string> CreateCustomerAsync(string? email, string? name, string idempotencyKey)
    {
        Interlocked.Increment(ref CallCount);
        IdempotencyKeys.Add(idempotencyKey);

        // Настоящий Stripe по тому же ключу вернул бы того же клиента — воспроизводим это,
        // иначе тест на идемпотентность проверял бы подделку, а не правило.
        var existing = _existingByKey.GetOrAdd(idempotencyKey, _ =>
        {
            Interlocked.Increment(ref CreateCustomerCount);
            return $"cus_test_{Interlocked.Increment(ref _counter)}";
        });

        return Task.FromResult(existing);
    }

    private readonly ConcurrentDictionary<string, string> _existingByKey = new();

    public Task<string?> GetDefaultPaymentMethodIdAsync(string customerId)
    {
        Interlocked.Increment(ref CallCount);
        Defaults.TryGetValue(customerId, out var id);
        return Task.FromResult(id);
    }

    public Task<IReadOnlyList<StripeCardSnapshot>> ListCardsAsync(string customerId)
    {
        Interlocked.Increment(ref CallCount);
        IReadOnlyList<StripeCardSnapshot> cards = Cards.Values
            .Where(card => card.CustomerId == customerId)
            .OrderBy(card => card.Id, StringComparer.Ordinal)
            .ToList();
        return Task.FromResult(cards);
    }

    public Task<StripeCardSnapshot?> GetCardAsync(string paymentMethodId)
    {
        Interlocked.Increment(ref CallCount);
        Cards.TryGetValue(paymentMethodId, out var card);
        return Task.FromResult(card);
    }

    public Task DetachCardAsync(string paymentMethodId)
    {
        Interlocked.Increment(ref CallCount);
        DetachedCards.Add(paymentMethodId);
        Cards.TryRemove(paymentMethodId, out _);
        return Task.CompletedTask;
    }

    public Task SetDefaultCardAsync(string customerId, string? paymentMethodId)
    {
        Interlocked.Increment(ref CallCount);
        Defaults[customerId] = paymentMethodId;
        return Task.CompletedTask;
    }

    public Task<string?> CreateSetupIntentAsync(string customerId)
    {
        Interlocked.Increment(ref CallCount);
        return Task.FromResult<string?>($"seti_test_{customerId}_secret");
    }

    /// <summary>true — Stripe не выдаёт сессии покупателя (как при сбое API); касса должна работать и так.</summary>
    public volatile bool FailCustomerSessions;

    public Task<string?> CreateCheckoutSessionSecretAsync(string customerId)
    {
        Interlocked.Increment(ref CallCount);
        if (FailCustomerSessions)
        {
            throw new InvalidOperationException("Stripe customer sessions are unavailable in this test.");
        }
        return Task.FromResult<string?>($"cuss_test_{customerId}_secret");
    }
}
