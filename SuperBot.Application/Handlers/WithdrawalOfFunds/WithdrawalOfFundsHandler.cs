using MediatR;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class WithdrawalOfFundsHandler(ITelegramBotClient _botClient, IPayService _payService, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<WithdrawalOfFundsCommand>(_mediator), IRequestHandler<WithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(WithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            await SendToChangeDialogStateAsync(request.ChatId);

            var user = await userRepository.GetUserByIdAsync(request.UserID);

            string paymentMessage = $"Вы запросили средств {request.Amount} ₽ с вашего аккаунта\n" + //TODO Текст
                                    $"На карту: {user.ChoseCard}.\n"; //TODO Учитывать тип

            // Отправляем сообщение пользователю
            await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            var response = await _payService.CreatePayoutAsync(request.Amount, "RUB", request.DestinationType, user.ChoseCard);
            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: response,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );
        }
    }
}
