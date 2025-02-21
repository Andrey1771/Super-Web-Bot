using MediatR;
using SuperBot.Application.Commands.Investment;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types.Enums;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.Investment
{
    public class InvestmentDecisionHandler(ITelegramBotClient _botClient, IPayService _payService, IMediator _mediator, ITranslationsService _translationsService, IAdminSettingsProvider _adminSettingsProvider) : DialogCommandHandler<InvestmentDecisionCommand>(_mediator, _translationsService), IRequestHandler<InvestmentDecisionCommand, Message>
    {
        public async Task<Message> Handle(InvestmentDecisionCommand request, CancellationToken cancellationToken)
        {
            if (request.Decision == "Invest")
            {
                // Генерация ссылки на оплату через YooKassa
                var payment = await _payService.CreatePaymentAsync(500m, "RUB", "investment", "Инвестиции", Guid.NewGuid().ToString());// Todo

                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: string.Format(_translationsService.Translation.FollowLinkToPay, payment.ConfirmationUrl),
                    cancellationToken: cancellationToken
                );
            }
            else if (request.Decision == "Decline")
            {
                var ownerName = _adminSettingsProvider.Username;
                var ownerUrl = $"https://t.me/{ownerName}";
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: string.Format(_translationsService.Translation.IfYouHaveQuestions, ownerUrl),
                    parseMode: ParseMode.Html,
                    cancellationToken: cancellationToken
                );
            }

            return null;
        }
    }
}
