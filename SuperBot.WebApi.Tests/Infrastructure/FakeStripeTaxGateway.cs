using System.Collections.Concurrent;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Tests.Infrastructure;

/// <summary>
/// Stripe Tax в памяти: ставка по стране, налог внутри суммы строк. Запоминает расчёты, транзакции и сторно —
/// по ним тесты проверяют, что и сколько раз ушло бы в Stripe.
/// </summary>
public class FakeStripeTaxGateway : IStripeTaxGateway
{
    private int _counter;

    /// <summary>Ставки по странам; страны нет в списке — налог 0, как без регистрации.</summary>
    public readonly ConcurrentDictionary<string, decimal> Rates = new(new Dictionary<string, decimal>
    {
        ["DE"] = 19m,
        ["FR"] = 20m,
        ["EE"] = 24m
    });

    /// <summary>true — любой вызов падает, как при заблокированном Stripe.</summary>
    public volatile bool Fail;

    /// <summary>true — расчёты проходят, а запись транзакции падает: так выглядит потерянный ответ на неё.</summary>
    public volatile bool FailTransactions;

    public readonly ConcurrentQueue<TaxCalculationDraft> Calculations = new();
    /// <summary>reference транзакции → расчёт.</summary>
    public readonly ConcurrentDictionary<string, string> Transactions = new();
    public readonly ConcurrentQueue<TaxReversalDraft> Reversals = new();

    public Task<TaxCalculationSnapshot> CalculateAsync(TaxCalculationDraft draft)
    {
        ThrowIfFailing();
        Calculations.Enqueue(draft);

        var country = draft.Country ?? "DE";
        var rate = Rates.TryGetValue(country, out var value) ? value : 0m;
        var total = draft.Lines.Sum(line => line.AmountMinor);
        var tax = draft.Lines.Sum(line => line.AmountMinor - (long)Math.Round(line.AmountMinor / (1m + rate / 100m), MidpointRounding.AwayFromZero));

        return Task.FromResult(new TaxCalculationSnapshot
        {
            Id = $"taxcalc_test_{Interlocked.Increment(ref _counter)}",
            AmountTotalMinor = total,
            TaxInclusiveMinor = tax,
            Country = country,
            TaxType = "vat",
            RatePercent = rate,
            TaxabilityReason = rate > 0 ? "standard_rated" : "not_collecting",
            ExpiresAt = DateTime.UtcNow.AddDays(90)
        });
    }

    public Task<string> CreateTransactionAsync(string calculationId, string reference, string idempotencyKey)
    {
        ThrowIfFailing();
        if (FailTransactions)
        {
            throw new Stripe.StripeException("Stripe did not answer the transaction request (test).");
        }
        // Как в Stripe: reference транзакции уникален. Повтор с тем же расчётом возвращает ту же транзакцию
        // (идемпотентность), повтор с другим расчётом получает отказ.
        var stored = Transactions.GetOrAdd(reference, calculationId);
        if (!string.Equals(stored, calculationId, StringComparison.Ordinal))
        {
            throw new Stripe.StripeException($"A tax transaction with reference {reference} already exists (test).");
        }
        return Task.FromResult($"tax_tx_{reference}");
    }

    public Task<string> ReverseTransactionAsync(TaxReversalDraft draft, string idempotencyKey)
    {
        ThrowIfFailing();
        Reversals.Enqueue(draft);
        return Task.FromResult($"tax_rev_{draft.Reference}");
    }

    private void ThrowIfFailing()
    {
        if (Fail)
        {
            throw new Stripe.StripeException("Stripe is unreachable (test).");
        }
    }
}
