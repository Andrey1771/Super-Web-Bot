using MediatR;
using SuperBot.Application.Commands.Investment;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Interfaces;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers.Investment
{
    public class InvestmentDecisionHandler(ITelegramBotClient _botClient, IPayService _payService, IMediator _mediator) : DialogCommandHandler<OpenTopUpSteamCommand>(_mediator), IRequestHandler<InvestmentDecisionCommand, Message>
    {
        public async Task<Message> Handle(InvestmentDecisionCommand request, CancellationToken cancellationToken)
        {
            if (request.Decision == "Invest")
            {
                // Генерация ссылки на оплату через YooKassa
                string paymentUrl = await _payService.CreatePaymentAsync(500m, "RUB", "investment", "Инвестиции");

                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: $"Перейдите по ссылке для оплаты: {paymentUrl}",
                    cancellationToken: cancellationToken
                );
            }
            else if (request.Decision == "Decline")
            {
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Если у вас возникли вопросы, свяжитесь с нами.",
                    cancellationToken: cancellationToken
                );
            }

            return null;
        }
    }
}
