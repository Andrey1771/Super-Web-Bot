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

namespace SuperBot.Application.Handlers.Investment
{
    public class EnterInvestmentDurationHandler(ITelegramBotClient _botClient, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<EnterInvestmentDurationCommand>(_mediator), IRequestHandler<EnterInvestmentDurationCommand, Message>
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

            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            var user = await userRepository.GetUserByIdAsync(request.UserId);


            var amount = user.ChoseAmountOfInvestment;
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
