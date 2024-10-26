using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Application.Commands.TopUp;

namespace SuperBot.Application.Handlers.TopUp
{
    //TODO Рефакторинг
    public class TopUpAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IPayService _payService) : DialogCommandHandler<TopUpAccountCommand>(_mediator), IRequestHandler<TopUpAccountCommand, Message>
    {
        // TODO Вынести в конфиг
        private const decimal commissionRate = 0.15m;// 15% комиссия
        private const long adminChatId = 795184375;// TODO!

        public async Task<Message> Handle(TopUpAccountCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            await SendToChangeDialogStateAsync(request.ChatId);

            var payLink = await _payService.CreatePaymentAsync(request.Amount, "RUB", $"Пополнение аккаунта", "Payment");

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = $"Вы запросили пополнение на {request.Amount} ₽ для аккаунта.\n" + //TODO Текст
                                    $"Пожалуйста, перейдите по ссылке для оплаты: <a href='{payLink}'>Ссылка</a>";

            // Отправляем сообщение пользователю
            var sentMessage = await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: paymentMessage,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken
            );

            return sentMessage;
        }
    }
}
