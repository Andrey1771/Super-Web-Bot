using MediatR;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Entities;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.BuyGame;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram.BuyGame
{
    public class BuyGameHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<BuyGameCommand>(_mediator, _translationsService), IRequestHandler<BuyGameCommand, Message>
    {
        public async Task<Message> Handle(BuyGameCommand request, CancellationToken cancellationToken)
        {
            // Получаем сервисы так, так как есть обращение root сервиса
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var gameRepository = serviceScope.ServiceProvider.GetService(typeof(IGameRepository)) as IGameRepository;
            var orderRepository = serviceScope.ServiceProvider.GetService(typeof(IOrderRepository)) as IOrderRepository;

            var chatId = request.ChatId;
            var userName = request.FromUsername;
            var gameName = request.Text;


            // Поиск игры в базе данных
            var games = await gameRepository.GetAllAsync();
            var game = games.FirstOrDefault(g => g.Name == gameName);

            if (game == null)
            {
                //return Unit.Value;
                await SendToChangeDialogStateAsync(chatId);
                return await _botClient.SendTextMessageAsync(chatId, _translationsService.Translation.NotFoundGameError);
            }

            // Создаем заказ
            var newOrder = new Order
            {
                GameName = game.Name,
                UserName = userName,
                OrderDate = DateTime.UtcNow
            };

            await orderRepository.CreateOrderAsync(newOrder);

            await SendToChangeDialogStateAsync(chatId);
            // Подтверждаем покупку
            return await _botClient.SendTextMessageAsync(chatId, string.Format(_translationsService.Translation.NavigateToGamePurchase, game.Name));
        }
    }
}
