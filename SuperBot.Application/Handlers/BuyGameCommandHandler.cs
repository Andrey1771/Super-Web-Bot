using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;

namespace SuperBot.Application.Handlers
{
    public class BuyGameCommandHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService) : IRequestHandler<BuyGameCommand, Message>
    {
        public Task<Message> Handle(BuyGameCommand request, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }
    }
}
