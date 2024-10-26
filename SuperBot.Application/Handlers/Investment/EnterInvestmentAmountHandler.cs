using MediatR;
using SuperBot.Application.Commands.Base;
using SuperBot.Core.Entities;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers.Investment
{
    public class EnterInvestmentAmountHandler(ITelegramBotClient _botClient, IMediator _mediator) : DialogCommandHandler<OpenTopUpSteamCommand>(_mediator), IRequestHandler<EnterInvestmentAmountCommand, Message>
    {
        public async Task<Message> Handle(EnterInvestmentAmountCommand request, CancellationToken cancellationToken)
        {
            // Проверка корректности суммы (можно добавить свои ограничения)
            if (request.Amount <= 0)
            {
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Некорректная сумма, введите сумму больше 0.",
                    cancellationToken: cancellationToken
                );
            }

            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: "Введите срок инвестиций в днях (не менее 30 дней).",
                cancellationToken: cancellationToken
            );
        }
    }
}
