using MediatR;
using SuperBot.Application.Commands.Base;
using SuperBot.Application.Commands.Investment;
using SuperBot.Core.Entities;
using Telegram.Bot.Types.ReplyMarkups;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers.Investment
{
    public class EnterInvestmentDurationHandler(ITelegramBotClient _botClient, IMediator _mediator) : DialogCommandHandler<OpenTopUpSteamCommand>(_mediator), IRequestHandler<EnterInvestmentDurationCommand, Message>
    {
        public async Task<Message> Handle(EnterInvestmentDurationCommand request, CancellationToken cancellationToken)
        {
            if (request.Duration < 30)
            {
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Минимальный срок инвестиций — 30 дней.",
                    cancellationToken: cancellationToken
                );
            }

            // Расчет доходности
            decimal profit = request.Amount * 0.15m;
            decimal total = request.Amount + profit;

            // Переводим диалог в состояние с выбором
            await SendToChangeDialogStateAsync(request.ChatId);

            var keyboard = new InlineKeyboardMarkup(new[]
            {
            new InlineKeyboardButton("Инвестировать") { CallbackData = "Invest" },
            new InlineKeyboardButton("Отказаться") { CallbackData = "Decline" }
        });

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: $"Сумма: {request.Amount:C}\nСрок: {request.Duration} дней\nДоходность: +15%\nИтого: {total:C}\nХотите инвестировать?",
                replyMarkup: keyboard,
                cancellationToken: cancellationToken
            );
        }
    }
}
