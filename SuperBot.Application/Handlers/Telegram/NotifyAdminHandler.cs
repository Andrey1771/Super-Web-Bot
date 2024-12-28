using MediatR;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Commands.Telegram.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.WebApi.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.Telegram
{
    public class NotifyAdminHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IAdminSettingsProvider _adminSettingsProvider) : IRequestHandler<NotifyAdminCommand, Message>
    {
        private readonly long adminChatId = _adminSettingsProvider.AdminChatId;

        public async Task<Message> Handle(NotifyAdminCommand request, CancellationToken cancellationToken)
        {
            await NotifyAdmin(user.Username, steamLogin, request.Amount, totalAmount);
        }

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(string username, string steamLogin, decimal amount, decimal totalAmount)
        {
            string adminMessage = string.Format(_translationsService.Translation.NotifyTopUpSteam, username, steamLogin, amount, totalAmount, "Нет");
            // Отправка уведомления админу (укажите здесь ID чата админа)
            await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
