using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Caps how many LLM generations run at once across the whole app. Self-hosted Ollama has finite
/// capacity, so a spike (or spam) of parallel requests would otherwise blow up latency for everyone.
/// A request tries to take a slot within a short window; if none frees up it is told the assistant is
/// busy instead of being queued onto the model indefinitely.
/// </summary>
public interface ILlmConcurrencyLimiter
{
    /// <summary>Tries to reserve an LLM slot. Returns a lease to dispose when done, or null if busy.</summary>
    Task<IDisposable?> TryAcquireAsync(CancellationToken cancellationToken);
}

public class LlmConcurrencyLimiter : ILlmConcurrencyLimiter
{
    private readonly SemaphoreSlim _semaphore;
    private readonly TimeSpan _wait;

    public LlmConcurrencyLimiter(IOptions<SupportChatOptions> options)
    {
        var maxConcurrent = Math.Max(1, options.Value.MaxConcurrentLlm);
        _semaphore = new SemaphoreSlim(maxConcurrent, maxConcurrent);
        _wait = TimeSpan.FromSeconds(Math.Max(0, options.Value.LlmBusyWaitSeconds));
    }

    public async Task<IDisposable?> TryAcquireAsync(CancellationToken cancellationToken)
    {
        var acquired = await _semaphore.WaitAsync(_wait, cancellationToken);
        return acquired ? new Lease(_semaphore) : null;
    }

    private sealed class Lease : IDisposable
    {
        private SemaphoreSlim? _semaphore;

        public Lease(SemaphoreSlim semaphore) => _semaphore = semaphore;

        public void Dispose()
        {
            // Guard against double-release.
            var s = Interlocked.Exchange(ref _semaphore, null);
            s?.Release();
        }
    }
}
