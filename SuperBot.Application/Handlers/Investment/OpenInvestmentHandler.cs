using MediatR;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers.Investment
{
    public class OpenInvestmentHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<OpenInvestmentCommand>(_mediator), IRequestHandler<OpenInvestmentCommand, Message>
    {
        public async Task<Message> Handle(OpenInvestmentCommand request, CancellationToken cancellationToken)
        {
            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    replyMarkup: GetButtons(),
                    text: _translationsService.Translation.InvestInYourFuture,
                    cancellationToken: cancellationToken
            );
        }

        private InlineKeyboardMarkup GetButtons()
        {
            var button = InlineKeyboardButton.WithCallbackData(_translationsService.Translation.StartInvest, _translationsService.KeyboardKeys.StartInvest);

            return new InlineKeyboardMarkup(button);
        }
    }
}
