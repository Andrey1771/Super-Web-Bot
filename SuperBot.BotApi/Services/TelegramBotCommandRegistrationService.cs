using Telegram.Bot.Exceptions;

namespace SuperBot.BotApi.Services;

public sealed class TelegramBotCommandRegistrationService : IHostedService
{
    private readonly TelegramCommandRouter _router;
    private readonly ILogger<TelegramBotCommandRegistrationService> _logger;

    public TelegramBotCommandRegistrationService(TelegramCommandRouter router, ILogger<TelegramBotCommandRegistrationService> logger)
    {
        _router = router;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _router.RegisterBotCommandsAsync(cancellationToken);
            _logger.LogInformation("Telegram bot command menu registered");
        }
        catch (RequestException error)
        {
            _logger.LogWarning(error, "Telegram bot command menu registration failed");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
