using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Application.Commands.BuyGame;
using SuperBot.Application.Handlers.Telegram.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers.Telegram.BuyGame
{
    public class OpenBuyGameHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<OpenBuyGameCommand>(_mediator, _translationsService), IRequestHandler<OpenBuyGameCommand, Message>
    {
        public async Task<Message> Handle(OpenBuyGameCommand request, CancellationToken cancellationToken)
        {
            return await SendToChangeDialogStateAsync(request.ChatId, _translationsService.Translation.NavigateToGamePurchase);
        }
    }
}
