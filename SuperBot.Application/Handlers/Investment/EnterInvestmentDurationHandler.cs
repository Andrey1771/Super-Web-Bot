using MediatR;
using SuperBot.Application.Commands.Base;
using SuperBot.Application.Commands.Investment;
using SuperBot.Core.Entities;
using Telegram.Bot.Types.ReplyMarkups;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Interfaces.IBotStateService;
using SuperBot.Core.Interfaces;

namespace SuperBot.Application.Handlers.Investment
{
    public class EnterInvestmentDurationHandler(ITelegramBotClient _botClient, IServiceProvider _serviceProvider, IMediator _mediator, IBotStateWriterService _botStateWriterService, IBotStateReaderService _botStateReaderService, ITranslationsService _translationsService) : DialogCommandHandler<EnterInvestmentDurationCommand>(_mediator, _translationsService), IRequestHandler<EnterInvestmentDurationCommand, Message>
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

            var oldState = await _botStateReaderService.GetChatStateAsync(request.UserId);

            var amount = oldState.UserState.ChoseAmountOfInvestment;
            // Расчет доходности
            decimal profit = amount * 0.15m;
            decimal total = amount + profit;

            // Переводим диалог в состояние с выбором
            await SendToChangeDialogStateAsync(request.ChatId);

            var keyboard = new InlineKeyboardMarkup(new[]
            {
            new InlineKeyboardButton("Инвестировать") { CallbackData = "Invest" },
            new InlineKeyboardButton("Отказаться") { CallbackData = "Decline" }
        });

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: $"Сумма: {amount:C}\nСрок: {request.Duration} дней\nДоходность: +15%\nИтого: {total:C}\nХотите инвестировать?",
                replyMarkup: keyboard,
                cancellationToken: cancellationToken
            );
        }
    }
}
