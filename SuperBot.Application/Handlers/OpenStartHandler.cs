using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot.Types;
using Telegram.Bot;
using SuperBot.Core.Entities;
using Telegram.Bot.Types.Enums;
using System.Text;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers
{
    public class OpenStartHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<OpenStartCommand>(_mediator, _translationsService), IRequestHandler<OpenStartCommand, Message>
    {
        public async Task<Message> Handle(OpenStartCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            await SendToChangeDialogStateAsync(request.ChatId);

            if (!await userRepository.UserExistsAsync(request.UserId.ToString()))
            {
                var newUser = new Core.Entities.User();
                newUser.UserId = request.UserId;
                newUser.Username = request.Username;
                newUser.Discount = 3;
                newUser.Balance = 0;
                newUser.CountOfInvited = 0;
                newUser.QuantityBeforeIncrease = 10;

                await userRepository.AddUserAsync(newUser);
            }

            await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetStartText(),
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken);

            return await GetMainMenu(request.ChatId);
        }

        private Task<Message> GetMainMenu(long chatId)
        {
            var command = new GetMainMenuCommand();
            command.ChatId = chatId;//TODO

            return _mediator.Send(command);
        }

        public string GetStartText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine(_translationsService.Translation.DescriptionBotStart);
            return stringBuilder.ToString();
        }
    }
}
