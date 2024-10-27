using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Application.Commands.Base;
using SuperBot.Application.Commands.InternationalTransfers;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.WebApi.Types;
using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;

namespace SuperBot.WebApi.Services;

public class UpdateHandler(ITelegramBotClient _bot, ILogger<UpdateHandler> _logger, IMediator _mediator,
    ITranslationsService _translationsService, IBotStateReaderService _botStateReaderService) : IUpdateHandler
{
    public async Task HandleErrorAsync(ITelegramBotClient botClient, Exception exception, HandleErrorSource source, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Error occurred");
        if (exception is RequestException)
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
    }

    public async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        switch (update)
        {
            case { Message: { } message }:
                await HandleMessage(message);
                break;
            case { CallbackQuery: { } callbackQuery }:
                await HandleCallbackQuery(callbackQuery);
                break;
            default:
                _logger.LogWarning("Unsupported update type: {UpdateType}", update.Type);
                break;
        }
    }

    private async Task HandleMessage(Message msg)
    {
        if (msg.Text is null) return;

        var telegramData = new TelegramDataForProcessing
        {
            Text = msg.Text,
            CommandName = msg.Text.Split(' ')[0],
            FromUsername = msg.From?.Username,
            ChatId = msg.Chat.Id,
            UserID = msg.From.Id,
            UserFirstName = msg.From.FirstName
        };

        try
        {
            var sentMessage = await HandleCommandAsync(telegramData);
            _logger.LogInformation("Message sent with ID: {MessageId}", sentMessage?.MessageId);
        }
        catch(Exception error)
        {
            await SendError(telegramData, error);
            _logger.LogInformation("Произошла ошибка {Message}", error.Message);
        }
    }

    private Task<Message> SendError(TelegramDataForProcessing data, Exception error) =>
        _mediator.Send(new ErrorCommand { ChatId = data.ChatId, ErrorMessage = error.Message });

    private async Task<Message> HandleCommandAsync(TelegramDataForProcessing telegramData)
    {
        var command = telegramData.CommandName;
        var chatState = await _botStateReaderService.GetChatStateAsync(telegramData.ChatId);
        var dialogState = chatState?.DialogState ?? DialogState.MainMenu;

        return command switch
        {
            var cmd when cmd == _translationsService.KeyboardKeys.BuySteamGames => await ChangeDialogState(telegramData, DialogState.BuyGame, _translationsService.Translation.NavigateToGamePurchase),
            _ when dialogState == DialogState.BuyGame => await BuySteamGames(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.Account => await OpenMyAccount(telegramData),
            var cmd when cmd == _translationsService.KeyboardKeys.ReferralProgram => await OpenReferralProgram(telegramData),
            var cmd when cmd == _translationsService.KeyboardKeys.Start => await OpenStart(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.SteamTopUp => await OpenTopUpBalance(telegramData),
            _ when dialogState == DialogState.TopUpWithLogin => await PrepareTopUpBalance(telegramData),
            _ when dialogState == DialogState.TopUpWithData => await TopUpBalance(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.TopUpBalance => await OpenTopUpAccountBalance(telegramData),
            _ when dialogState == DialogState.TopUpAccountWithData => await TopUpAccountBalance(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.WithdrawFunds => await OpenWithdrawalOfFunds(telegramData),
            _ when dialogState == DialogState.WithdrawalOfFundsWithData => await PrepareWithdrawalOfFunds(telegramData),
            _ when dialogState == DialogState.WithdrawalOfFundsWithCard => await WithdrawalOfFunds(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.Investments => await OpenInvestments(telegramData),
            var cmd when cmd == _translationsService.KeyboardKeys.StartInvest => await StartInvestments(telegramData),
            _ when dialogState == DialogState.AwaitingInvestmentAmount => await EnterInvestmentAmount(telegramData),
            _ when dialogState == DialogState.AwaitingInvestmentDuration => await EnterInvestmentDuration(telegramData),
            _ when dialogState == DialogState.InvestmentDecision => await OpenInvestmentDecision(telegramData),

            var cmd when cmd == _translationsService.KeyboardKeys.InternationalTransfers => await OpenInternationalTransfers(telegramData),
            _ when dialogState == DialogState.InternationalTransfers => await InternationalTransfers(telegramData),

            _ => await Usage(telegramData)
        };
    }

    private Task<Message> InternationalTransfers(TelegramDataForProcessing data) =>
        _mediator.Send(new InternationalTransfersCommand { ChatId = data.ChatId, Text = data.Text, Username = data.FromUsername });

    private Task<Message> OpenInternationalTransfers(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenInternationalTransfersCommand { ChatId = data.ChatId, UserId = data.UserID });


    private Task<Message> OpenInvestments(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenInvestmentCommand { ChatId = data.ChatId });

    private Task<Message> StartInvestments(TelegramDataForProcessing data) =>
        _mediator.Send(new StartInvestmentCommand { ChatId = data.ChatId });

    private Task<Message> EnterInvestmentAmount(TelegramDataForProcessing data) =>
        _mediator.Send(new EnterInvestmentAmountCommand { ChatId = data.ChatId, Amount = decimal.Parse(data.Text), UserId = data.UserID });

    private Task<Message> EnterInvestmentDuration(TelegramDataForProcessing data) =>
        _mediator.Send(new EnterInvestmentDurationCommand { ChatId = data.ChatId, Duration = int.Parse(data.Text), UserId = data.UserID });

    private Task<Message> OpenInvestmentDecision(TelegramDataForProcessing data) =>
        _mediator.Send(new InvestmentDecisionCommand { ChatId = data.ChatId, Decision = data.CommandName });

    private Task<Message> OpenWithdrawalOfFunds(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenWithdrawalOfFundsCommand { ChatId = data.ChatId });

    private Task<Message> PrepareWithdrawalOfFunds(TelegramDataForProcessing data) =>
        _mediator.Send(new PrepareWithdrawalOfFundsCommand { ChatId = data.ChatId, UserId = data.UserID, ChoseCard = data.Text });

    private Task<Message> WithdrawalOfFunds(TelegramDataForProcessing data) =>
        _mediator.Send(new WithdrawalOfFundsCommand { ChatId = data.ChatId, UserID = data.UserID, DestinationType = "card", Amount = decimal.Parse(data.Text) });

    private Task<Message> OpenTopUpAccountBalance(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenTopUpAccountCommand { ChatId = data.ChatId });

    private Task<Message> TopUpAccountBalance(TelegramDataForProcessing data) =>
        _mediator.Send(new TopUpAccountCommand { ChatId = data.ChatId, UserId = data.UserID, Amount = decimal.Parse(data.Text) });

    private Task<Message> OpenTopUpBalance(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenTopUpSteamCommand { ChatId = data.ChatId });

    private Task<Message> PrepareTopUpBalance(TelegramDataForProcessing data) =>
        _mediator.Send(new PrepareTopUpSteamCommand { ChatId = data.ChatId, UserId = data.UserID, SteamLogin = data.Text });

    private Task<Message> TopUpBalance(TelegramDataForProcessing data) =>
        _mediator.Send(new TopUpSteamCommand { ChatId = data.ChatId, UserId = data.UserID, Amount = decimal.Parse(data.Text) });

    private Task<Message> OpenStart(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenStartCommand { ChatId = data.ChatId, UserId = data.UserID, Username = data.FromUsername });

    private Task<Message> OpenMyAccount(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenMyAccountCommand { ChatId = data.ChatId, UserID = data.UserID, Name = data.UserFirstName });

    private Task<Message> OpenReferralProgram(TelegramDataForProcessing data) =>
        _mediator.Send(new OpenReferralProgramCommand { ChatId = data.ChatId, UserId = data.UserID });

    private Task<Message> ChangeDialogState(TelegramDataForProcessing data, DialogState state, string text) =>
        _mediator.Send(new ChangeDialogStateCommand { ChatId = data.ChatId, DialogState = state, Text = text });

    private async Task<Message> Usage(TelegramDataForProcessing data)
    {
        var chatState = await _botStateReaderService.GetChatStateAsync(data.ChatId);
        return chatState?.DialogState switch
        {
            DialogState.MainMenu => await GetMainMenu(data),
            DialogState.BuyGame => await ChangeDialogState(data, DialogState.MainMenu, _translationsService.Translation.BotMenu),
            _ => throw new NotImplementedException()
        };
    }

    private Task<Message> GetMainMenu(TelegramDataForProcessing data) =>
        _mediator.Send(new GetMainMenuCommand { ChatId = data.ChatId });

    private Task<Message> BuySteamGames(TelegramDataForProcessing data) =>
        _mediator.Send(new BuyGameCommand { ChatId = data.ChatId, FromUsername = data.FromUsername, Text = data.Text });

    private async Task HandleCallbackQuery(CallbackQuery callbackQuery)
    {
        if (callbackQuery.Data is null) return;

        var telegramData = new TelegramDataForProcessing
        {
            Text = callbackQuery.Message.Text,
            CommandName = callbackQuery.Data,
            FromUsername = callbackQuery.Message.From.Username,
            ChatId = callbackQuery.Message.Chat.Id,
            UserID = callbackQuery.From.Id,
            UserFirstName = callbackQuery.Message.Chat.FirstName
        };

        await HandleCommandAsync(telegramData);
    }
}

/*
     * stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.BuySteamGames, _translationsService.Translation.BuySteamGames));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.InternationalTransfers, _translationsService.Translation.InternationalTransfers));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Investments, _translationsService.Translation.Investments));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Account, _translationsService.Translation.Account));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SelectAction, _translationsService.Translation.SelectAction));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SteamTopUp, _translationsService.Translation.SteamTopUp));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Store, _translationsService.Translation.Store));
     * 
     * 
        async Task<Message> Usage(Message msg)
        {
            const string usage = """
                <b><u>Bot menu</u></b>:
                /photo          - send a photo
                /inline_buttons - send inline buttons
                /keyboard       - send keyboard buttons
                /remove         - remove keyboard buttons
                /request        - request location or contact
                /inline_mode    - send inline-mode results list
                /poll           - send a poll
                /poll_anonymous - send an anonymous poll
                /throw          - what happens if handler fails
            """;
            return await _bot.SendTextMessageAsync(msg.Chat, usage, parseMode: ParseMode.Html, replyMarkup: new ReplyKeyboardRemove());
        }
    */
/*
async Task<Message> SendPhoto(Message msg)
{
    await _bot.SendChatActionAsync(msg.Chat, ChatAction.UploadPhoto);
    await Task.Delay(2000); // simulate a long task
    await using var fileStream = new FileStream("Files/_bot.gif", FileMode.Open, FileAccess.Read);
    return await _bot.SendPhotoAsync(msg.Chat, fileStream, caption: "Read https://telegrambots.github.io/book/");
}

// Send inline keyboard. You can process responses in OnCallbackQuery handler
async Task<Message> SendInlineKeyboard(Message msg)
{
    var inlineMarkup = new InlineKeyboardMarkup()
        .AddNewRow("1.1", "1.2", "1.3")
        .AddNewRow()
            .AddButton("WithCallbackData", "CallbackData")
            .AddButton(InlineKeyboardButton.WithUrl("WithUrl", "https://github.com/TelegramBots/Telegram.Bot"));
    return await _bot.SendTextMessageAsync(msg.Chat, "Inline buttons:", replyMarkup: inlineMarkup);
}

async Task<Message> SendReplyKeyboard(Message msg)
{
    var replyMarkup = new ReplyKeyboardMarkup(true)
        .AddNewRow("1.1", "1.2", "1.3")
        .AddNewRow().AddButton("2.1").AddButton("2.2");
    return await _bot.SendTextMessageAsync(msg.Chat, "Keyboard buttons:", replyMarkup: replyMarkup);
}

async Task<Message> RemoveKeyboard(Message msg)
{
    return await _bot.SendTextMessageAsync(msg.Chat, "Removing keyboard", replyMarkup: new ReplyKeyboardRemove());
}

async Task<Message> RequestContactAndLocation(Message msg)
{
    var replyMarkup = new ReplyKeyboardMarkup(true)
        .AddButton(KeyboardButton.WithRequestLocation("Location"))
        .AddButton(KeyboardButton.WithRequestContact("Contact"));
    return await _bot.SendTextMessageAsync(msg.Chat, "Who or Where are you?", replyMarkup: replyMarkup);
}

async Task<Message> StartInlineQuery(Message msg)
{
    var button = InlineKeyboardButton.WithSwitchInlineQueryCurrentChat("Inline Mode");
    return await _bot.SendTextMessageAsync(msg.Chat, "Press the button to start Inline Query\n\n" +
        "(Make sure you enabled Inline Mode in @BotFather)", replyMarkup: new InlineKeyboardMarkup(button));
}

async Task<Message> SendPoll(Message msg)
{
    return await _bot.SendPollAsync(msg.Chat, "Question", PollOptions, isAnonymous: false);
}

async Task<Message> SendAnonymousPoll(Message msg)
{
    return await _bot.SendPollAsync(chatId: msg.Chat, "Question", PollOptions);
}

static Task<Message> FailingHandler(Message msg)
{
    throw new NotImplementedException("FailingHandler");
}

// Process Inline Keyboard callback data
private async Task OnCallbackQuery(CallbackQuery callbackQuery)
{
    _logger.LogInformation("Received inline keyboard callback from: {CallbackQueryId}", callbackQuery.Id);
    await _bot.AnswerCallbackQueryAsync(callbackQuery.Id, $"Received {callbackQuery.Data}");
    await _bot.SendTextMessageAsync(callbackQuery.Message!.Chat, $"Received {callbackQuery.Data}");
}

#region Inline Mode

private async Task OnInlineQuery(InlineQuery inlineQuery)
{
    _logger.LogInformation("Received inline query from: {InlineQueryFromId}", inlineQuery.From.Id);

    InlineQueryResult[] results = [ // displayed result
        new InlineQueryResultArticle("1", "Telegram.Bot", new InputTextMessageContent("hello")),
    new InlineQueryResultArticle("2", "is the best", new InputTextMessageContent("world"))
    ];
    await _bot.AnswerInlineQueryAsync(inlineQuery.Id, results, cacheTime: 0, isPersonal: true);
}

private async Task OnChosenInlineResult(ChosenInlineResult chosenInlineResult)
{
    _logger.LogInformation("Received inline result: {ChosenInlineResultId}", chosenInlineResult.ResultId);
    await _bot.SendTextMessageAsync(chosenInlineResult.From.Id, $"You chose result with Id: {chosenInlineResult.ResultId}");
}

#endregion

private Task OnPoll(Poll poll)
{
    _logger.LogInformation("Received Poll info: {Question}", poll.Question);
    return Task.CompletedTask;
}

private async Task OnPollAnswer(PollAnswer pollAnswer)
{
    var answer = pollAnswer.OptionIds.FirstOrDefault();
    var selectedOption = PollOptions[answer];
    if (pollAnswer.User != null)
        await _bot.SendTextMessageAsync(pollAnswer.User.Id, $"You've chosen: {selectedOption.Text} in poll");
}

private Task UnknownUpdateHandlerAsync(Update update)
{
    _logger.LogInformation("Unknown update type: {UpdateType}", update.Type);
    return Task.CompletedTask;
}
*/