using MediatR;
using SuperBot.Application.Commands;
using System.Resources;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers
{
    public class GetMainMenuCommandHandler : IRequestHandler<GetMainMenuCommand, Message>
    {
        private readonly ITelegramBotClient _botClient;
        private readonly ResourceManager _rm;


        public GetMainMenuCommandHandler(ITelegramBotClient botClient)
        {
            _botClient = botClient;
            _rm = new ResourceManager("Resource.ru", typeof(GetMainMenuCommandHandler).Assembly);
        }

        public async Task<Message> Handle(GetMainMenuCommand request, CancellationToken cancellationToken)
        {
            var keyboardButton = new KeyboardButton(_rm.GetString("MyOffice"));


            var keyboard = new ReplyKeyboardMarkup(keyboardButton); // "Мой кабинет", "Переводы за рубеж", "Пополнение Steam", "Купить игры Steam", "Инвестиции", "Магазин"

            // "My Office," "International Transfers," "Steam Top-Up," "Buy Steam Games," "Investments," "Store"
            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: "Выберите действие:",
                replyMarkup: keyboard,
                cancellationToken: cancellationToken);
        }
    }
}
