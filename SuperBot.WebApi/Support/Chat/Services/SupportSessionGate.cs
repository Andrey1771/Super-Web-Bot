using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Один ход в диалоге за раз. Клиент, отправивший два сообщения подряд, запускал две генерации
/// параллельно: каждая собирала историю, не видя чужого вопроса, и сохраняла ответ тогда, когда
/// освободится модель, — в переписке появлялись ответы невпопад и не в том порядке. Очередь
/// в пределах сессии делает ход атомарным: вставка вопроса, сборка истории и сохранение ответа.
/// </summary>
public interface ISupportSessionGate
{
    /// <summary>Занимает очередь сессии. Возвращает аренду для Dispose или null, если не дождались.</summary>
    Task<IDisposable?> TryEnterAsync(string sessionId, CancellationToken cancellationToken);
}

public class SupportSessionGate : ISupportSessionGate
{
    private readonly ConcurrentDictionary<string, Entry> _gates = new(StringComparer.Ordinal);
    private readonly TimeSpan _wait;

    public SupportSessionGate(IOptions<SupportChatOptions> options)
    {
        // Ждём не дольше, чем отведено на сам ответ: предыдущий ход к этому моменту либо закончился,
        // либо уже отвалился по таймауту, и держать соединение дальше незачем.
        _wait = TimeSpan.FromSeconds(Math.Max(5, options.Value.LlmTimeoutSeconds));
    }

    public async Task<IDisposable?> TryEnterAsync(string sessionId, CancellationToken cancellationToken)
    {
        var entry = Rent(sessionId);

        bool entered;
        try
        {
            entered = await entry.Semaphore.WaitAsync(_wait, cancellationToken);
        }
        catch
        {
            Return(sessionId, entry);
            throw;
        }

        if (!entered)
        {
            Return(sessionId, entry);
            return null;
        }

        return new Lease(this, sessionId, entry);
    }

    // Счётчик ожидающих не даёт словарю расти по одной записи на каждую сессию за всё время жизни
    // процесса: последний уходящий забирает запись с собой.
    private Entry Rent(string sessionId)
    {
        while (true)
        {
            var entry = _gates.GetOrAdd(sessionId, _ => new Entry());
            lock (entry)
            {
                if (!entry.Removed)
                {
                    entry.Waiters++;
                    return entry;
                }
            }
            // Запись успели удалить между GetOrAdd и захватом блокировки — берём следующую.
        }
    }

    private void Return(string sessionId, Entry entry)
    {
        lock (entry)
        {
            entry.Waiters--;
            if (entry.Waiters > 0)
            {
                return;
            }

            entry.Removed = true;
            _gates.TryRemove(new KeyValuePair<string, Entry>(sessionId, entry));
        }
    }

    private sealed class Entry
    {
        public SemaphoreSlim Semaphore { get; } = new(1, 1);

        public int Waiters { get; set; }

        public bool Removed { get; set; }
    }

    private sealed class Lease : IDisposable
    {
        private readonly SupportSessionGate _gate;
        private readonly string _sessionId;
        private Entry? _entry;

        public Lease(SupportSessionGate gate, string sessionId, Entry entry)
        {
            _gate = gate;
            _sessionId = sessionId;
            _entry = entry;
        }

        public void Dispose()
        {
            // Защита от повторного освобождения.
            var entry = Interlocked.Exchange(ref _entry, null);
            if (entry == null)
            {
                return;
            }

            entry.Semaphore.Release();
            _gate.Return(_sessionId, entry);
        }
    }
}
