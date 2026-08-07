using MediatR;
using Microsoft.Extensions.Configuration;
using SuperBot.Application.Commands.BuyGame;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Handlers.Telegram.BuyGame;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Core.Services;
using SuperBot.BotApi.Types;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.Payments;

namespace SuperBot.BotApi.Services;

/// <summary>
/// Разбор входящих Telegram-апдейтов: команды, inline-кнопки и платежи Telegram Stars.
/// </summary>
public class TelegramUpdateHandler(ITelegramBotClient _bot, ILogger<TelegramUpdateHandler> _logger, IMediator _mediator,
    ITranslationsService _translationsService, IBotStateReaderService _botStateReaderService,
    IServiceScopeFactory _scopeFactory, IConfiguration _configuration)
{
    private const string StarsCallbackPrefix = "stars:";

    public async Task HandleUpdateAsync(Update update, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        switch (update)
        {
            case { Message: { } message }:
                await HandleMessage(message, cancellationToken);
                break;
            case { CallbackQuery: { } callbackQuery }:
                await HandleCallbackQuery(callbackQuery, cancellationToken);
                break;
            case { PreCheckoutQuery: { } preCheckoutQuery }:
                await HandlePreCheckoutQuery(preCheckoutQuery, cancellationToken);
                break;
            default:
                _logger.LogWarning("Unsupported update type: {UpdateType}", update.Type);
                break;
        }
    }

    public Task HandleErrorAsync(Exception exception)
    {
        _logger.LogError(exception, "Telegram update processing error");
        return Task.CompletedTask;
    }

    private async Task HandleMessage(Message msg, CancellationToken cancellationToken)
    {
        // Сообщение об успешной оплате Stars приходит без текста — обрабатываем до текстовой ветки.
        if (msg.SuccessfulPayment is { } payment)
        {
            await HandleSuccessfulPayment(msg, payment, cancellationToken);
            return;
        }

        if (msg.Text is null || msg.From is null) return;

        var telegramData = new TelegramDataForProcessing
        {
            Text = msg.Text,
            CommandName = msg.Text.Split(' ')[0],
            FromUsername = msg.From.Username,
            ChatId = msg.Chat.Id,
            UserID = msg.From.Id,
            UserFirstName = msg.From.FirstName
        };

        try
        {
            var sentMessage = await HandleCommandAsync(telegramData);
            _logger.LogInformation("Message sent with ID: {MessageId}", sentMessage?.MessageId);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Bot command failed for chat {ChatId}", telegramData.ChatId);
            await SendError(telegramData, error);
        }
    }

    private async Task HandleCallbackQuery(CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        if (callbackQuery.Data is null || callbackQuery.Message is null) return;

        // Гасим "часики" на кнопке сразу, до обработки.
        await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);

        // Оплата Stars: отдельная ветка, не проходит через диалоговый роутер.
        if (callbackQuery.Data.StartsWith(StarsCallbackPrefix, StringComparison.Ordinal))
        {
            var gameId = callbackQuery.Data[StarsCallbackPrefix.Length..];
            await SendStarsInvoice(callbackQuery.Message.Chat.Id, gameId, cancellationToken);
            return;
        }

        var telegramData = new TelegramDataForProcessing
        {
            Text = callbackQuery.Message.Text,
            CommandName = callbackQuery.Data,
            FromUsername = callbackQuery.From.Username,
            ChatId = callbackQuery.Message.Chat.Id,
            UserID = callbackQuery.From.Id,
            UserFirstName = callbackQuery.From.FirstName
        };

        try
        {
            await HandleCommandAsync(telegramData);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Bot callback failed for chat {ChatId}", telegramData.ChatId);
            await SendError(telegramData, error);
        }
    }

    private async Task<Message> HandleCommandAsync(TelegramDataForProcessing telegramData)
    {
        var command = telegramData.CommandName;
        var chatState = await _botStateReaderService.GetChatStateAsync(telegramData.ChatId);
        var dialogState = chatState?.DialogState ?? DialogState.MainMenu;

        return command switch
        {
            var cmd when cmd == _translationsService.KeyboardKeys.Start => await OpenStart(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.BuySteamGames => await OpenBuyGame(telegramData),
            _ when dialogState == DialogState.BuyGame => await BuyGame(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.Account => await OpenMyAccount(telegramData),
            var cmd when cmd == _translationsService.KeyboardKeys.ReferralProgram => await OpenReferralProgram(telegramData),

            _ => await GetMainMenu(telegramData)
        };
    }

    // ---- Telegram Stars ----

    private async Task SendStarsInvoice(long chatId, string gameId, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var game = string.IsNullOrWhiteSpace(gameId) ? null : await gameRepository.GetByIdAsync(gameId);
        // Невышедшая игра для покупателя в чате — то же «недоступна», отдельного сообщения не заводим.
        if (game == null || GameRelease.IsUpcoming(game.ReleaseDate, DateTime.UtcNow))
        {
            await _bot.SendTextMessageAsync(chatId, _translationsService.Translation.StarsGameUnavailable, cancellationToken: cancellationToken);
            return;
        }

        var title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;
        var stars = StarPrice.FromUsd(game.Price, StarsPerUsd());
        var description = string.Format(_translationsService.Translation.StarsInvoiceDescription, title);
        var prices = new[] { new LabeledPrice(title, stars) };

        // Обложка на инвойсе — та же, что в карточке (принцип сайта). Нет валидной → инвойс без картинки.
        var coverUrl = GameCoverUrlResolver.ResolveCoverUrl(game.ImagePath, _configuration["MainUrl"]);
        var photoUrl = GameCoverUrlResolver.IsUsablePhotoUrl(coverUrl) ? coverUrl : null;

        // Digital goods → валюта XTR, provider_token пустой. Payload = gameId (нужен на successful_payment).
        await _bot.SendInvoiceAsync(
            chatId,
            title: title,
            description: description,
            payload: game.Id,
            currency: "XTR",
            prices: prices,
            photoUrl: photoUrl,
            cancellationToken: cancellationToken);
    }

    private async Task HandlePreCheckoutQuery(PreCheckoutQuery query, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();

        var game = string.IsNullOrWhiteSpace(query.InvoicePayload) ? null : await gameRepository.GetByIdAsync(query.InvoicePayload);
        if (game == null)
        {
            await _bot.AnswerPreCheckoutQueryAsync(query.Id, errorMessage: _translationsService.Translation.StarsGameUnavailable, cancellationToken: cancellationToken);
            return;
        }

        // Всё в порядке — подтверждаем платёж (в течение 10 секунд, иначе Telegram отменит).
        await _bot.AnswerPreCheckoutQueryAsync(query.Id, errorMessage: null, cancellationToken: cancellationToken);
    }

    private async Task HandleSuccessfulPayment(Message msg, SuccessfulPayment payment, CancellationToken cancellationToken)
    {
        if (msg.From is null) return;

        using var scope = _scopeFactory.CreateScope();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var orderRepository = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var fulfillment = scope.ServiceProvider.GetRequiredService<IKeyFulfillmentService>();

        var chatId = msg.Chat.Id;
        var telegramUserId = msg.From.Id;

        // Оплата корзины из Mini App: заказ уже создан, payload = cart:<orderId>. Находим и выдаём целиком.
        var payload = payment.InvoicePayload ?? string.Empty;
        if (payload.StartsWith(Controllers.MiniAppController.CartPayloadPrefix, StringComparison.Ordinal))
        {
            await HandleCartPayment(orderRepository, fulfillment, msg, payment,
                payload[Controllers.MiniAppController.CartPayloadPrefix.Length..], cancellationToken);
            return;
        }

        var game = string.IsNullOrWhiteSpace(payment.InvoicePayload) ? null : await gameRepository.GetByIdAsync(payment.InvoicePayload);
        var title = game == null ? "Game" : (string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title);

        var now = DateTime.UtcNow;
        var orderId = Guid.NewGuid();
        var order = new Order
        {
            Id = orderId,
            OrderGuid = orderId,
            // Ключи для Stars-покупки закрепляются за псевдо-пользователем tg:<id>; доставка идёт в этот же чат.
            UserId = $"tg:{telegramUserId}",
            UserName = string.IsNullOrWhiteSpace(msg.From.Username) ? $"tg:{telegramUserId}" : msg.From.Username,
            PaymentProvider = "telegram_stars",
            GameId = payment.InvoicePayload ?? string.Empty,
            GameName = title,
            IsPaid = true,
            IsFulfilled = false,
            OrderDate = now,
            CreatedAt = now,
            PaidAt = now,
            Status = "AWAITING_KEYS",
            PaymentStatus = "PAID",
            FulfillmentStatus = "PENDING_KEYS",
            Currency = "XTR",
            TotalAmount = payment.TotalAmount,
            Notes = $"Telegram Stars charge {payment.TelegramPaymentChargeId}",
            Items = new List<OrderItemSnapshot>
            {
                new()
                {
                    GameId = payment.InvoicePayload,
                    Title = title,
                    Quantity = 1,
                    UnitPrice = game?.Price ?? 0m,
                    FinalUnitPrice = game?.Price ?? 0m,
                    LineTotal = game?.Price ?? 0m
                }
            }
        };

        await orderRepository.CreateOrderAsync(order);
        // Выдаёт ключ (закрепляет за tg:<id>), доставляет его в этот чат и проставляет статус.
        await fulfillment.FulfillOrderAsync(order);

        var followUp = order.IsFulfilled
            ? _translationsService.Translation.StarsPaymentSuccess
            : _translationsService.Translation.StarsPaymentPending;
        await _bot.SendTextMessageAsync(chatId, followUp, parseMode: ParseMode.Html, cancellationToken: cancellationToken);
    }

    // Оплата корзины: заказ создан заранее в MiniAppController. Помечаем оплаченным и выдаём все позиции.
    private async Task HandleCartPayment(IOrderRepository orderRepository, IKeyFulfillmentService fulfillment,
        Message msg, SuccessfulPayment payment, string orderId, CancellationToken cancellationToken)
    {
        var chatId = msg.Chat.Id;
        var order = string.IsNullOrWhiteSpace(orderId) ? null : await orderRepository.GetOrderByIdAsync(orderId);
        if (order == null)
        {
            _logger.LogError("Cart payment for unknown order {OrderId} (charge {Charge})", orderId, payment.TelegramPaymentChargeId);
            await _bot.SendTextMessageAsync(chatId, _translationsService.Translation.StarsPaymentPending, parseMode: ParseMode.Html, cancellationToken: cancellationToken);
            return;
        }

        var now = DateTime.UtcNow;
        order.IsPaid = true;
        order.PaidAt = now;
        order.PaymentStatus = "PAID";
        order.Status = "AWAITING_KEYS";
        order.Currency = "XTR";
        order.TotalAmount = payment.TotalAmount;
        order.Notes = $"Telegram Stars charge {payment.TelegramPaymentChargeId}";

        // Выдаёт ключи по всем позициям, доставляет в этот чат и проставляет честный статус.
        await fulfillment.FulfillOrderAsync(order);

        var followUp = order.IsFulfilled
            ? _translationsService.Translation.StarsPaymentSuccess
            : _translationsService.Translation.StarsPaymentPending;
        await _bot.SendTextMessageAsync(chatId, followUp, parseMode: ParseMode.Html, cancellationToken: cancellationToken);
    }

    private int StarsPerUsd() =>
        _configuration.GetValue<int?>("BotPayments:StarsPerUsd") ?? StarPrice.DefaultStarsPerUsd;

    // ---- MediatR-команды бота ----

    private Task<Message> SendError(TelegramDataForProcessing data, Exception error) =>
        _mediator.Send(new ErrorCommand { ChatId = data.ChatId, ErrorMessage = error.Message });

    private Task<Message> OpenStart(TelegramDataForProcessing data)
    {
        // Deep-link привязки: "/start <token>" — второй токен это payload.
        var parts = (data.Text ?? string.Empty).Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var payload = parts.Length > 1 ? parts[1].Trim() : null;
        return _mediator.Send(new OpenStartCommand
        {
            ChatId = data.ChatId,
            UserId = data.UserID,
            Username = data.FromUsername,
            StartPayload = payload
        });
    }

    private Task<Message> OpenMyAccount(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenMyAccountCommand { ChatId = data.ChatId, UserID = data.UserID, Name = data.UserFirstName });

    private Task<Message> OpenReferralProgram(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenReferralProgramCommand { ChatId = data.ChatId, UserId = data.UserID });

    private Task<Message> OpenBuyGame(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenBuyGameCommand { ChatId = data.ChatId });

    private Task<Message> BuyGame(TelegramDataForProcessing data) =>
        _mediator.Send(new BuyGameCommand { ChatId = data.ChatId, FromUsername = data.FromUsername, Text = data.Text });

    private Task<Message> GetMainMenu(TelegramDataForProcessing data) =>
        _mediator.Send(new GetMainMenuCommand { ChatId = data.ChatId });
}
