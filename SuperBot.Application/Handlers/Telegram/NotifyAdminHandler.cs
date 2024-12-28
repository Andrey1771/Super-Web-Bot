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
using System.Xml.Linq;
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
            return await NotifyAdminAsync(request.Phone, request.Name, request.Email, request.Question);
        }

        // Уведомление администратора
        private Task<Message> NotifyAdminAsync(string phone, string name, string email, string question)
        {
            string adminMessage = string.Format(_translationsService.Translation.NotifyAdmin, phone, name, email, question);
            return _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
