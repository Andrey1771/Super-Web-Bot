using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using System.Text;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers
{
    public class OpenMyAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator mediator) : IRequestHandler<OpenMyAccountCommand, Message>
    {
        public async Task<Message> Handle(OpenMyAccountCommand request, CancellationToken cancellationToken)
        {
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
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.Account}:</u></b>");
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.ReferralProgram, _translationsService.Translation.ReferralProgram));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SteamTopUp, _translationsService.Translation.SteamTopUp));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.WithdrawFunds, _translationsService.Translation.WithdrawFunds));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.PurchaseHistory, _translationsService.Translation.PurchaseHistory));
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
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.ReferralProgram, _translationsService.KeyboardKeys.ReferralProgram),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.SteamTopUp, _translationsService.KeyboardKeys.SteamTopUp),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.WithdrawFunds, _translationsService.KeyboardKeys.WithdrawFunds),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.PurchaseHistory, _translationsService.KeyboardKeys.PurchaseHistory)
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
