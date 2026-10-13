using Microsoft.Extensions.Logging;

namespace SuperBot.WebApi.Services;

public sealed class SupportChatConsoleLoggerProvider : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName)
    {
        return new SupportChatConsoleLogger(categoryName);
    }

    public void Dispose()
    {
    }

    private sealed class SupportChatConsoleLogger : ILogger
    {
        private const string Prefix = "SupportChat.";
        private readonly string _categoryName;

        public SupportChatConsoleLogger(string categoryName)
        {
            _categoryName = categoryName;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel)
        {
            return _categoryName.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase);
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var timestamp = DateTime.UtcNow.ToString("O");
            var message = formatter(state, exception);
            var line = $"{timestamp} [{logLevel}] {_categoryName}: {message}";
            Console.Error.WriteLine(line);
            if (exception != null)
            {
                Console.Error.WriteLine(exception);
            }
        }
    }
}
