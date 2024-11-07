using MediatR;
using SuperBot.Application.Commands;

namespace SuperBot.Application.Handlers.WebCatalog
{
    public class LoadImageHandler(IServiceProvider _serviceProvider) : IRequestHandler<BaseCommand>
    {
        public Task Handle(BaseCommand request, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }
    }
}
