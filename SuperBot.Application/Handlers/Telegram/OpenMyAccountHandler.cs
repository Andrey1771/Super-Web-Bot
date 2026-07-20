using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using System.Text;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram
{
    public class OpenMyAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<OpenMyAccountCommand>(_mediator, _translationsService), IRequestHandler<OpenMyAccountCommand, Message>
    {
        public async Task<Message> Handle(OpenMyAccountCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(request.Name, request.UserID),
                parseMode: ParseMode.Html,
                replyMarkup: GetKeyboard(),
                cancellationToken: cancellationToken);
        }

        public string GetMenuText(string name, long userID)
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.Account}:</u></b>");
            stringBuilder.AppendLine(string.Format(_translationsService.Translation.AccountBody, name, userID));
            return stringBuilder.ToString();
        }

        private InlineKeyboardMarkup GetKeyboard()
        {
            return new InlineKeyboardMarkup(new[]
            {
                new[]
                {
                    InlineKeyboardButton.WithCallbackData(_translationsService.Translation.ReferralProgram, _translationsService.KeyboardKeys.ReferralProgram)
                }
            });
        }
    }
}
