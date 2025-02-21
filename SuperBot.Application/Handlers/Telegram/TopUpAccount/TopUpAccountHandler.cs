using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.TopUpAccount
{
    public class TopUpAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IPayService _payService, IAdminSettingsProvider _adminSettingsProvider) : DialogCommandHandler<TopUpAccountCommand>(_mediator, _translationsService), IRequestHandler<TopUpAccountCommand, Message>
    {
        private readonly decimal commissionRate = decimal.Parse(_adminSettingsProvider.CommissionRate.ToString()) / 100;
        private readonly long adminChatId = _adminSettingsProvider.AdminChatId;

        public async Task<Message> Handle(TopUpAccountCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            var pay = await _payService.CreatePaymentAsync(request.Amount, "RUB", $"Пополнение аккаунта", "Payment", Guid.NewGuid().ToString());

            // Формируем сообщение пользователю с запросом на оплату
            string paymentMessage = string.Format(_translationsService.Translation.RequestTopUp, request.Amount, pay.ConfirmationUrl);

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
