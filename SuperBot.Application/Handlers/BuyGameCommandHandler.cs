using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using System.Linq;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Entities;

namespace SuperBot.Application.Handlers
{
    public class BuyGameCommandHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IGameRepository gameRepository, IOrderRepository orderRepository) : IRequestHandler<BuyGameCommand, Message>
    {
        public async Task<Message> Handle(BuyGameCommand request, CancellationToken cancellationToken)
        {
            var chatId = request.ChatId;
            var userName = request.FromUsername;
            var gameName = request.Text;

            // Поиск игры в базе данных
            var games = await gameRepository.GetAllAsync();

            var game = games.FirstOrDefault(g => g.Name == gameName);

            if (game == null)
            {
                //return Unit.Value;
                return await _botClient.SendTextMessageAsync(chatId, "Извините, игра не найдена в нашем каталоге.");
            }

            // Если игра найдена, создаем заказ
            var newOrder = new Order
            {
                GameName = game.Name,
                UserName = userName,
                OrderDate = DateTime.UtcNow
            };

            await orderRepository.CreateOrderAsync(newOrder);

            // Подтверждаем покупку
            return await _botClient.SendTextMessageAsync(chatId, $"Игра '{game.Name}' успешно добавлена в ваш заказ!/n В ближайшее время с вами свяжутся.");
        }
    }
}
