using MediatR;
using Microsoft.AspNetCore.Components.Forms;
using SuperBot.Application.Commands;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Text;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers
{
    public class GetMainMenuHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator mediator) : DialogCommandHandler<GetMainMenuCommand>(mediator), IRequestHandler<GetMainMenuCommand, Message>
    {
        private Dictionary<string, string> commandDescriptions;

        public async Task<Message> Handle(GetMainMenuCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(),
                parseMode: ParseMode.Html,
                replyMarkup: GetKeyboard(request.ChatId),
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

        private InlineKeyboardMarkup GetKeyboard(long chatId)
        {
            var inlineKeyboard = new List<List<InlineKeyboardButton>>();

            var buttons = new List<InlineKeyboardButton>
            {
                
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.BuySteamGames, _translationsService.KeyboardKeys.BuySteamGames),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.InternationalTransfers, _translationsService.KeyboardKeys.InternationalTransfers),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.Investments, _translationsService.KeyboardKeys.Investments),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.Account, _translationsService.KeyboardKeys.Account),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.SelectAction, _translationsService.KeyboardKeys.SelectAction),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.SteamTopUp, _translationsService.KeyboardKeys.SteamTopUp),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.Store, _translationsService.KeyboardKeys.Store)
            };

            // Разбиваем на строки по 2 кнопки в каждой
            for (int i = 0; i < buttons.Count; i += 2)
            {
                var row = new List<InlineKeyboardButton>();

                // Добавляем первую кнопку в строке
                row.Add(buttons[i]);

                // Добавляем вторую кнопку в строке, если есть
                if (i + 1 < buttons.Count)
                {
                    row.Add(buttons[i + 1]);
                }

                // Добавляем строку с двумя кнопками в клавиатуру
                inlineKeyboard.Add(row);
            }

            // Создаем клавиатуру
            return new InlineKeyboardMarkup(inlineKeyboard);
        }
    }
}