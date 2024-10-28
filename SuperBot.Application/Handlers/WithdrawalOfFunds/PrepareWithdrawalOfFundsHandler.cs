using MediatR;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Application.Handlers.WithdrawalOfFunds
{
    public class PrepareWithdrawalOfFundsHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<PrepareWithdrawalOfFundsCommand>(_mediator), IRequestHandler<PrepareWithdrawalOfFundsCommand, Message>
    {
        public async Task<Message> Handle(PrepareWithdrawalOfFundsCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            await SendToChangeDialogStateAsync(request.ChatId);

            var user = await userRepository.GetUserByIdAsync(request.UserId);
            user.ChoseCard = request.ChoseCard;

            await userRepository.UpdateUserAsync(user);

            var message = "Введите сумму в рублях";

            // Отправляем сообщение пользователю
            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: message,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );
        }
    }
}
