using MediatR;
using SuperBot.Application.Commands.Investment;
using Telegram.Bot.Types.ReplyMarkups;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.Investment
{
    public class EnterInvestmentDurationHandler(ITelegramBotClient _botClient, IServiceProvider _serviceProvider, IMediator _mediator, IBotStateWriterService _botStateWriterService, IBotStateReaderService _botStateReaderService, ITranslationsService _translationsService) : DialogCommandHandler<EnterInvestmentDurationCommand>(_mediator, _translationsService), IRequestHandler<EnterInvestmentDurationCommand, Message>
    {
        public async Task<Message> Handle(EnterInvestmentDurationCommand request, CancellationToken cancellationToken)
        {
            if (request.Duration < 30)
            {
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: _translationsService.Translation.MinimumInvestmentPeriod,
                    cancellationToken: cancellationToken
                );
            }

            var oldState = await _botStateReaderService.GetChatStateAsync(request.ChatId);

            var amount = oldState.UserState.ChoseAmountOfInvestment;
            // Расчет доходности
            decimal profit = amount * 0.15m;
            decimal total = amount + profit;

            // Переводим диалог в состояние с выбором
            await SendToChangeDialogStateAsync(request.ChatId);

            var keyboard = new InlineKeyboardMarkup(new[]
            {
            new InlineKeyboardButton(_translationsService.Translation.Invest) { CallbackData = "Invest" },
            new InlineKeyboardButton(_translationsService.Translation.Reject) { CallbackData = "Decline" }
        });

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: string.Format(_translationsService.Translation.SumTimeValueTotal, amount, request.Duration, total),
                replyMarkup: keyboard,
                cancellationToken: cancellationToken
            );
        }
    }
}
