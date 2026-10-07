using Microsoft.Extensions.Caching.Memory;
using SuperBot.Core.Demo;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Кэш в памяти, разложенный по песочницам: тот же ключ из разных песочниц — разные записи.
///
/// Каталог, витрины, счётчики и прочее кэшируются примерно в двадцати местах по ключам вроде «catalog»,
/// и без этого правка цены в одной песочнице на минуту показывалась бы всем остальным. Вместо правки
/// каждого места ключ дополняется id текущей песочницы здесь, в одном месте. Вне песочниц (обычный магазин,
/// шаблон демо) ключи остаются как были.
/// </summary>
public sealed class SandboxAwareMemoryCache(IMemoryCache inner) : IMemoryCache
{
    private sealed record SandboxKey(string Sandbox, object Key);

    private static object Scoped(object key) => DemoSandbox.CurrentId is { } id ? new SandboxKey(id, key) : key;

    public ICacheEntry CreateEntry(object key) => inner.CreateEntry(Scoped(key));

    public void Remove(object key) => inner.Remove(Scoped(key));

    public bool TryGetValue(object key, out object? value) => inner.TryGetValue(Scoped(key), out value);

    public void Dispose() => inner.Dispose();
}
