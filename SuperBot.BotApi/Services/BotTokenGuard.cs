using Telegram.Bot;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types;

namespace SuperBot.BotApi.Services;

/// <summary>
/// Проверка токена бота на старте.
///
/// Раньше <see cref="TelegramBotClient"/> создавался лениво в DI-фабрике: сервис поднимался
/// без токена, а падал на первом же запросе — исключением из конструктора контроллера, до
/// любого catch. Админка получала 500 и писала «Could not reach the backend», хотя бэкенд
/// был жив, а не хватало одной строки в .env. Здесь та же проверка выполняется один раз,
/// заранее, и результат виден там, где его ищут: в логе при `docker compose up`.
/// </summary>
public static class BotTokenGuard
{
    public const string MissingTokenMessage =
        "BOT_TOKEN is not set: the Bot section in the admin panel and the Telegram webhook will not work. " +
        "Add the token to .env (BotConfiguration__BotToken) and restart the service.";

    /// <summary>
    /// Токен из конфигурации годится для <see cref="TelegramBotClient"/>. Проверяем тем же
    /// конструктором, что и библиотека, — иначе разошлись бы с её правилами формата.
    /// </summary>
    public static bool IsValid(string? token, out string reason)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            reason = MissingTokenMessage;
            return false;
        }

        try
        {
            _ = new TelegramBotClientOptions(token);
            reason = string.Empty;
            return true;
        }
        catch (ArgumentException ex)
        {
            reason = $"BOT_TOKEN is set, but Telegram.Bot rejects it ({ex.Message}). The Bot section in the admin panel will not work.";
            return false;
        }
    }
}

/// <summary>
/// Клиент на случай отсутствующего или неверного токена. Любой вызов Telegram завершается
/// понятным исключением, а не падением DI: контроллеры создаются, статусная страница ловит
/// ошибку в своём catch и показывает её текст специалисту.
/// </summary>
public sealed class UnconfiguredTelegramBotClient(string reason) : ITelegramBotClient
{
    private InvalidOperationException Fail() => new(reason);

    public bool LocalBotServer => false;
    public long BotId => 0;
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(100);
    public Telegram.Bot.Exceptions.IExceptionParser ExceptionsParser { get; set; } =
        new Telegram.Bot.Exceptions.DefaultExceptionParser();

    public event AsyncEventHandler<Telegram.Bot.Args.ApiRequestEventArgs>? OnMakingApiRequest;
    public event AsyncEventHandler<Telegram.Bot.Args.ApiResponseEventArgs>? OnApiResponseReceived;

    public Task<TResponse> SendRequest<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default) =>
        Task.FromException<TResponse>(Fail());

    public Task<bool> TestApi(CancellationToken cancellationToken = default) =>
        Task.FromException<bool>(Fail());

    public Task DownloadFile(string filePath, Stream destination, CancellationToken cancellationToken = default) =>
        Task.FromException(Fail());

    public Task DownloadFile(TGFile file, Stream destination, CancellationToken cancellationToken = default) =>
        Task.FromException(Fail());
}
