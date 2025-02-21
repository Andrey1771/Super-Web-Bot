using MediatR;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Application.Commands.InternationalTransfers;
using Telegram.Bot.Types.Enums;
using SuperBot.Core.Interfaces;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.InternationalTransfers
{
    public class InternationalTransfersHandler(ITelegramBotClient _botClient, IMediator _mediator, ITranslationsService _translationsService, IAdminSettingsProvider _adminSettingsProvider) : DialogCommandHandler<InternationalTransfersCommand>(_mediator, _translationsService), IRequestHandler<InternationalTransfersCommand, Message>
    {
        public async Task<Message> Handle(InternationalTransfersCommand request, CancellationToken cancellationToken)
        {
            string notificationMessage = string.Format(_translationsService.Translation.RequestAccepted, request.Text, request.Username);
            //await _notificationService.SendNotificationAsync(notificationMessage);

            await NotifyAdmin(notificationMessage);

            await SendToChangeDialogStateAsync(request.ChatId);

            var ownerUsername = _adminSettingsProvider.Username;
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
            var adminChatId = _adminSettingsProvider.AdminChatId;
            string adminMessage = text;

            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}

