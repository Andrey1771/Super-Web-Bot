using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Base;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Core.Services;
using SuperBot.WebApi.Services;

namespace SuperBot.Application.Handlers.TopUp
{
    public class TopUpAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IPayService _payService, IAdminSettingsProvider _adminSettingsProvider) : DialogCommandHandler<TopUpAccountCommand>(_mediator, _translationsService), IRequestHandler<TopUpAccountCommand, Message>
    {
        private readonly decimal commissionRate = decimal.Parse(_adminSettingsProvider.CommissionRate.ToString()) / 100;
        private readonly long adminChatId = _adminSettingsProvider.AdminChatId;

        public async Task<Message> Handle(TopUpAccountCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            var payLink = await _payService.CreatePaymentAsync(request.Amount, "RUB", $"Пополнение аккаунта", "Payment", Guid.NewGuid().ToString());

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = string.Format(_translationsService.Translation.RequestTopUp, request.Amount, payLink);

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
