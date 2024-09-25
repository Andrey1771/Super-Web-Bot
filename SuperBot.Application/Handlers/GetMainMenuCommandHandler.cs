using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using System.Text;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers
{
    public class GetMainMenuCommandHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService) : IRequestHandler<GetMainMenuCommand, Message>
    {
        private Dictionary<string, string> commandDescriptions;

        public async Task<Message> Handle(GetMainMenuCommand request, CancellationToken cancellationToken)
        {
            var inlineMarkup = new InlineKeyboardMarkup()
            .AddNewRow("1.1", "1.2", "1.3")
            .AddNewRow()
                .AddButton("WithCallbackData", "CallbackData")
                .AddButton(InlineKeyboardButton.WithUrl("WithUrl", "https://github.com/TelegramBots/Telegram.Bot"));

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(),
                parseMode: ParseMode.Html,
                replyMarkup: inlineMarkup,
                cancellationToken: cancellationToken);
        }

        public string GetMenuText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.BotMenu}</u></b>");
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.BuySteamGames, _translationsService.Translation.BuySteamGames));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.InternationalTransfers, _translationsService.Translation.InternationalTransfers));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Investments, _translationsService.Translation.Investments));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Account, _translationsService.Translation.Account));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SelectAction, _translationsService.Translation.SelectAction));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SteamTopUp, _translationsService.Translation.SteamTopUp));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Store, _translationsService.Translation.Store));
            return stringBuilder.ToString();
        }

        private string GetFormat(string commandKey, string commandValue)
        {
            return $"{commandKey} - {commandValue}";
        }
    }
}