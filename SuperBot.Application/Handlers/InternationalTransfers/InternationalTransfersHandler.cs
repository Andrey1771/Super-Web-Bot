using MediatR;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Handlers.Base;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.InternationalTransfers;
using SuperBot.Core.Entities;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types.Enums;
using SuperBot.Core.Interfaces;

namespace SuperBot.Application.Handlers.InternationalTransfers
{
    public class InternationalTransfersHandler(ITelegramBotClient _botClient, IMediator _mediator, ITranslationsService _translationsService) : DialogCommandHandler<InternationalTransfersCommand>(_mediator), IRequestHandler<InternationalTransfersCommand, Message>
    {
        public async Task<Message> Handle(InternationalTransfersCommand request, CancellationToken cancellationToken)
        {
            string notificationMessage = string.Format(_translationsService.Translation.RequestAccepted, request.Text, request.Username);
            //await _notificationService.SendNotificationAsync(notificationMessage);

            await NotifyAdmin(notificationMessage);

            await SendToChangeDialogStateAsync(request.ChatId);

            var ownerUsername = "andrey6eb";
            var ownerUrl = $"https://t.me/{ownerUsername}";
            return await _botClient.SendTextMessageAsync(
            chatId: request.ChatId,
            text: string.Format(_translationsService.Translation.RequestAccepted, ownerUrl),
            cancellationToken: cancellationToken
        );
        }

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(string text)
        {
            var adminChatId = 795184375;// TODO!
            string adminMessage = text;

            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}

