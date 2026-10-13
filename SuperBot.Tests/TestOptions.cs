using Microsoft.Extensions.Options;

namespace SuperBot.Tests;

/// <summary>
/// Один объект настроек во всех трёх видах, которые принимает код: IOptions (снимок на старте),
/// IOptionsSnapshot (на запрос), IOptionsMonitor (живой). Тестам без разницы, а сервисы
/// требуют конкретный интерфейс — FxRateService живёт на мониторе, CheckoutPricingService на снимке.
/// </summary>
public sealed class TestOptions<T> : IOptions<T>, IOptionsSnapshot<T>, IOptionsMonitor<T> where T : class
{
    public TestOptions(T value) => Value = value;
    public T Value { get; }
    public T CurrentValue => Value;
    public T Get(string? name) => Value;
    public IDisposable? OnChange(Action<T, string?> listener) => null;
}

public static class TestOptions
{
    public static TestOptions<T> Of<T>(T value) where T : class => new(value);
}
