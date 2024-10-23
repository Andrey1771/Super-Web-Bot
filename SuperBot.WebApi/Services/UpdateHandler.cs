using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.WebApi.Types;
using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;

namespace SuperBot.WebApi.Services;
public class UpdateHandler(ITelegramBotClient bot, ILogger<UpdateHandler> logger, IMediator mediator,
    ITranslationsService translationsService, IBotStateReaderService botStateReaderService) : IUpdateHandler
{

    public async Task HandleErrorAsync(ITelegramBotClient botClient, Exception exception, HandleErrorSource source, CancellationToken cancellationToken)
    {
        logger.LogInformation("HandleError: {Exception}", exception);
        // Cooldown in case of network connection error
        if (exception is RequestException)
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
    }

    public async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        await (update switch
        {
            { Message: { } message } => OnMessage(message),
            { CallbackQuery: { } callbackQuery } => OnCallbackQuery(callbackQuery),
            _ => throw new NotImplementedException(),//TODO
            /*{ EditedMessage: { } message } => OnMessage(message),
{ CallbackQuery: { } callbackQuery } => OnCallbackQuery(callbackQuery),
{ InlineQuery: { } inlineQuery } => OnInlineQuery(inlineQuery),
{ ChosenInlineResult: { } chosenInlineResult } => OnChosenInlineResult(chosenInlineResult),
{ Poll: { } poll } => OnPoll(poll),
{ PollAnswer: { } pollAnswer } => OnPollAnswer(pollAnswer),
// ChannelPost:
// EditedChannelPost:
// ShippingQuery:
// PreCheckoutQuery:
_ => UnknownUpdateHandlerAsync(update)*/
        });
    }

    private async Task OnMessage(Message msg)
    {
        logger.LogInformation("Receive message type: {MessageType}", msg.Type);
        if (msg.Text is not { } messageText)
            return;

        string command = messageText.Split(' ')[0];
        var telegramDataForProcessing = new TelegramDataForProcessing();
        telegramDataForProcessing.Text = msg.Text;
        telegramDataForProcessing.CommandName = command;
        telegramDataForProcessing.FromUsername = msg.From.Username;
        telegramDataForProcessing.ChatId = msg.Chat.Id;
        telegramDataForProcessing.UserID = msg.From.Id;
        telegramDataForProcessing.UserFirstName = msg.From.FirstName;


        var sentMessage = await HandleMessageAsync(telegramDataForProcessing);

        logger.LogInformation("The message was sent with id: {SentMessageId}", sentMessage?.MessageId);
    }

    private async Task<Message> HandleMessageAsync(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = telegramDataForProcessing.CommandName;
        if (command == translationsService.KeyboardKeys.BuySteamGames)
        {
            await ChangeDialogState(telegramDataForProcessing, DialogState.BuyGame, translationsService.Translation.NavigateToGamePurchase);
            return await Task.FromResult<Message>(null);
        }
        else if ((await botStateReaderService.GetChatStateAsync(telegramDataForProcessing.ChatId)).DialogState == DialogState.BuyGame)
        {
            return await BuySteamGames(telegramDataForProcessing);
        }
        else if (command == translationsService.KeyboardKeys.Account)
        {
            return await OpenMyAccount(telegramDataForProcessing);
        }
        else if (command == translationsService.KeyboardKeys.ReferralProgram)
        {
            return await OpenReferralProgram(telegramDataForProcessing);
        }
        else if (command == translationsService.KeyboardKeys.Start)
        {
            return await OpenStart(telegramDataForProcessing);
        }
        else
        {
            return await Usage(telegramDataForProcessing);
        }
    }

    private Task<Message> OpenStart(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = new OpenStartCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO
        command.UserId = telegramDataForProcessing.UserID;
        command.Username = telegramDataForProcessing.FromUsername;
        
        return mediator.Send(command);
    }

    private Task<Message> ChangeDialogState(TelegramDataForProcessing telegramDataForProcessing, DialogState dialogState, string text)
    {
        var command = new ChangeDialogStateCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO
        command.DialogState = dialogState;
        command.Text = text;
        return mediator.Send(command);
    }

    private async Task<Message> Usage(TelegramDataForProcessing telegramDataForProcessing)
    {
        switch ((await botStateReaderService.GetChatStateAsync(telegramDataForProcessing.ChatId)).DialogState)
        {
            case DialogState.MainMenu:
                return await GetMainMenu(telegramDataForProcessing);

            case DialogState.BuyGame:
                await BuySteamGames(telegramDataForProcessing);
                return await ChangeDialogState(telegramDataForProcessing, DialogState.MainMenu, translationsService.Translation.BotMenu);

            default:
                throw new NotImplementedException();
        }

    }

    private Task<Message> GetMainMenu(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = new GetMainMenuCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO

        return mediator.Send(command);
    }

    private Task<Message> BuySteamGames(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = new BuyGameCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO
        command.FromUsername = telegramDataForProcessing.FromUsername;
        command.Text = telegramDataForProcessing.Text;

        return mediator.Send(command);
    }

    private Task<Message> OpenMyAccount(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = new OpenMyAccountCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO
        command.UserID = telegramDataForProcessing.UserID;
        command.Name = telegramDataForProcessing.UserFirstName;

        return mediator.Send(command);
    }
    
    private Task<Message> OpenReferralProgram(TelegramDataForProcessing telegramDataForProcessing)
    {
        var command = new OpenReferralProgramCommand();
        command.ChatId = telegramDataForProcessing.ChatId;//TODO
        command.UserId = telegramDataForProcessing.UserID;

        return mediator.Send(command);
    }
    // Process Inline Keyboard callback data
    private async Task OnCallbackQuery(CallbackQuery callbackQuery)
    {
        //TODO
        logger.LogInformation("Received inline keyboard callback from: {CallbackQueryId}", callbackQuery.Id);

        var msg = callbackQuery.Message;
        if (callbackQuery.Data is "")
            return;

        var telegramDataForProcessing = new TelegramDataForProcessing();
        telegramDataForProcessing.Text = msg.Text;
        telegramDataForProcessing.CommandName = callbackQuery.Data;
        telegramDataForProcessing.FromUsername = msg.From.Username;
        telegramDataForProcessing.ChatId = msg.Chat.Id;

        var sentMessage = await HandleMessageAsync(telegramDataForProcessing);
        //await bot.AnswerCallbackQueryAsync(callbackQuery.Id, $"Received {callbackQuery.Data}");
        //await bot.SendTextMessageAsync(callbackQuery.Message!.Chat, $"Received {callbackQuery.Data}");
    }

    private async Task OnError(CallbackQuery callbackQuery)
    {
        
        logger.LogInformation("Received inline keyboard callback from: {CallbackQueryId}", callbackQuery.Id);

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
            return await bot.SendTextMessageAsync(msg.Chat, usage, parseMode: ParseMode.Html, replyMarkup: new ReplyKeyboardRemove());
        }
    */
    /*
    async Task<Message> SendPhoto(Message msg)
    {
        await bot.SendChatActionAsync(msg.Chat, ChatAction.UploadPhoto);
        await Task.Delay(2000); // simulate a long task
        await using var fileStream = new FileStream("Files/bot.gif", FileMode.Open, FileAccess.Read);
        return await bot.SendPhotoAsync(msg.Chat, fileStream, caption: "Read https://telegrambots.github.io/book/");
    }

    // Send inline keyboard. You can process responses in OnCallbackQuery handler
    async Task<Message> SendInlineKeyboard(Message msg)
    {
        var inlineMarkup = new InlineKeyboardMarkup()
            .AddNewRow("1.1", "1.2", "1.3")
            .AddNewRow()
                .AddButton("WithCallbackData", "CallbackData")
                .AddButton(InlineKeyboardButton.WithUrl("WithUrl", "https://github.com/TelegramBots/Telegram.Bot"));
        return await bot.SendTextMessageAsync(msg.Chat, "Inline buttons:", replyMarkup: inlineMarkup);
    }

    async Task<Message> SendReplyKeyboard(Message msg)
    {
        var replyMarkup = new ReplyKeyboardMarkup(true)
            .AddNewRow("1.1", "1.2", "1.3")
            .AddNewRow().AddButton("2.1").AddButton("2.2");
        return await bot.SendTextMessageAsync(msg.Chat, "Keyboard buttons:", replyMarkup: replyMarkup);
    }

    async Task<Message> RemoveKeyboard(Message msg)
    {
        return await bot.SendTextMessageAsync(msg.Chat, "Removing keyboard", replyMarkup: new ReplyKeyboardRemove());
    }

    async Task<Message> RequestContactAndLocation(Message msg)
    {
        var replyMarkup = new ReplyKeyboardMarkup(true)
            .AddButton(KeyboardButton.WithRequestLocation("Location"))
            .AddButton(KeyboardButton.WithRequestContact("Contact"));
        return await bot.SendTextMessageAsync(msg.Chat, "Who or Where are you?", replyMarkup: replyMarkup);
    }

    async Task<Message> StartInlineQuery(Message msg)
    {
        var button = InlineKeyboardButton.WithSwitchInlineQueryCurrentChat("Inline Mode");
        return await bot.SendTextMessageAsync(msg.Chat, "Press the button to start Inline Query\n\n" +
            "(Make sure you enabled Inline Mode in @BotFather)", replyMarkup: new InlineKeyboardMarkup(button));
    }

    async Task<Message> SendPoll(Message msg)
    {
        return await bot.SendPollAsync(msg.Chat, "Question", PollOptions, isAnonymous: false);
    }

    async Task<Message> SendAnonymousPoll(Message msg)
    {
        return await bot.SendPollAsync(chatId: msg.Chat, "Question", PollOptions);
    }

    static Task<Message> FailingHandler(Message msg)
    {
        throw new NotImplementedException("FailingHandler");
    }

    // Process Inline Keyboard callback data
    private async Task OnCallbackQuery(CallbackQuery callbackQuery)
    {
        logger.LogInformation("Received inline keyboard callback from: {CallbackQueryId}", callbackQuery.Id);
        await bot.AnswerCallbackQueryAsync(callbackQuery.Id, $"Received {callbackQuery.Data}");
        await bot.SendTextMessageAsync(callbackQuery.Message!.Chat, $"Received {callbackQuery.Data}");
    }

    #region Inline Mode

    private async Task OnInlineQuery(InlineQuery inlineQuery)
    {
        logger.LogInformation("Received inline query from: {InlineQueryFromId}", inlineQuery.From.Id);

        InlineQueryResult[] results = [ // displayed result
            new InlineQueryResultArticle("1", "Telegram.Bot", new InputTextMessageContent("hello")),
        new InlineQueryResultArticle("2", "is the best", new InputTextMessageContent("world"))
        ];
        await bot.AnswerInlineQueryAsync(inlineQuery.Id, results, cacheTime: 0, isPersonal: true);
    }

    private async Task OnChosenInlineResult(ChosenInlineResult chosenInlineResult)
    {
        logger.LogInformation("Received inline result: {ChosenInlineResultId}", chosenInlineResult.ResultId);
        await bot.SendTextMessageAsync(chosenInlineResult.From.Id, $"You chose result with Id: {chosenInlineResult.ResultId}");
    }

    #endregion

    private Task OnPoll(Poll poll)
    {
        logger.LogInformation("Received Poll info: {Question}", poll.Question);
        return Task.CompletedTask;
    }

    private async Task OnPollAnswer(PollAnswer pollAnswer)
    {
        var answer = pollAnswer.OptionIds.FirstOrDefault();
        var selectedOption = PollOptions[answer];
        if (pollAnswer.User != null)
            await bot.SendTextMessageAsync(pollAnswer.User.Id, $"You've chosen: {selectedOption.Text} in poll");
    }

    private Task UnknownUpdateHandlerAsync(Update update)
    {
        logger.LogInformation("Unknown update type: {UpdateType}", update.Type);
        return Task.CompletedTask;
    }
*/
}

