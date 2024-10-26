using MediatR;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;

namespace SuperBot.Application.Handlers.Investment
{
    public class OpenInvestmentHandler(ITelegramBotClient _botClient, IPayService _payService, IMediator _mediator) : DialogCommandHandler<OpenInvestmentCommand>(_mediator), IRequestHandler<OpenInvestmentCommand, Message>
    {
        public async Task<Message> Handle(OpenInvestmentCommand request, CancellationToken cancellationToken)
        {
            // Переводим диалог в состояние ожидания срока инвестиций
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Инвестируйте в своё будущее с гарантированной доходностью +15%!\r\n\r\n" +
                    "Устали от нестабильности финансов? Хотите, чтобы деньги работали на вас? Мы предлагаем простой и надежный способ увеличить ваш капитал!\r\n\r\n" +
                    "+15% доходности на каждую инвестицию\r\nМинимальный срок всего 30 дней — быстрый возврат и рост вложений\r\n" +
                    "Абсолютная прозрачность условий и отсутствие скрытых комиссий\r\n" +
                    "🎯 Как это работает?\r\n\r\n" +
                    "Вводите сумму и срок инвестиций.\r\n" +
                    "Мы рассчитываем вашу доходность.\r\n" +
                    "Оплачиваете удобным способом и начинаете зарабатывать!\r\n" +
                    "Пример: Вложив 10 000 рублей, через 30 дней вы получите 11 500 рублей!\r\n\r\n" +
                    "🔥 Действуйте сейчас — начните инвестировать уже сегодня и сделайте первый шаг к финансовой свободе!\r\n\r\n" +
                    "💬 Если остались вопросы — мы всегда на связи.",
                    cancellationToken: cancellationToken
                );

        }
    }
}
