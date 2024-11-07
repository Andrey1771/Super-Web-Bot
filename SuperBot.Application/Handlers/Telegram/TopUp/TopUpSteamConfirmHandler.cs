using MediatR;
using Microsoft.AspNetCore.Components.Routing;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Telegram.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace SuperBot.Application.Handlers.Telegram.TopUp
{
    public class TopUpSteamConfirmHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IUrlService _urlService) : DialogCommandHandler<TopUpSteamConfirmCommand>(_mediator, _translationsService)//, IRequestHandler<TopUpSteamConfirmCommand, Message>
    {
        //public async Task<Message> Handle(TopUpSteamConfirmCommand request, CancellationToken cancellationToken)
        //{
        // Формируем сообщение пользователю с запросом на оплату
        //string paymentMessage = $"Вы запросили пополнение на {request.Amount} ₽ для аккаунта Steam: {steamLogin}.\n" + // TODO
        //$"Итого с комиссией {(commissionRate - discount) * 100}%: {totalAmount} ₽.\n" +
        //                        $"Пожалуйста, перейдите по ссылке для оплаты: <a href='{payLink}'>Ссылка</a>";

        // Отправляем сообщение пользователю
        //var sentMessage = await _botClient.SendTextMessageAsync(
        //    chatId: request.ChatId,
        //    text: paymentMessage,
        //    parseMode: ParseMode.Html,
        //    cancellationToken: cancellationToken
        //);

        // После оплаты сохраняем данные в базе данных или отправляем сообщение администратору
        //await NotifyAdmin(user.Username, steamLogin, request.Amount, totalAmount);
        //
        //return sentMessage;
        //}

        // Уведомление администратора о пополнении
        private async Task NotifyAdmin(string username, string steamLogin, decimal amount, decimal totalAmount)
        {
            // Отправка уведомления админу (укажите здесь ID чата админа)
            //await _botClient.SendTextMessageAsync(adminChatId, adminMessage, parseMode: ParseMode.Html);
        }
    }
}
