using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;

namespace SuperBot.Application.Handlers
{
    public class OpenMyAccountHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator mediator) : IRequestHandler<OpenMyAccountCommand, Message>
    {
        public Task<Message> Handle(OpenMyAccountCommand request, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }
    }
}
