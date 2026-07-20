using MediatR;
using SuperBot.Core.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using System.Text;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Handlers.Telegram.Base;

namespace SuperBot.Application.Handlers.Telegram
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

            // Deep-link привязки аккаунта: /start <token> связывает этот чат с сайтовым аккаунтом.
            if (!string.IsNullOrWhiteSpace(request.StartPayload))
            {
                await TryLinkAccountAsync(serviceScope.ServiceProvider, request, cancellationToken);
            }

            await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetStartText(),
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken);

            return await GetMainMenu(request.ChatId);
        }

        private async Task TryLinkAccountAsync(IServiceProvider services, OpenStartCommand request, CancellationToken cancellationToken)
        {
            var linkRepository = services.GetService(typeof(ITelegramLinkRepository)) as ITelegramLinkRepository;
            if (linkRepository == null)
            {
                return;
            }

            var link = await linkRepository.ConsumeTokenAndLinkAsync(
                request.StartPayload.Trim(),
                request.UserId,
                request.ChatId,
                request.Username);

            var message = link != null
                ? _translationsService.Translation.AccountLinkedSuccess
                : _translationsService.Translation.AccountLinkFailed;

            if (!string.IsNullOrWhiteSpace(message))
            {
                await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: message,
                    parseMode: ParseMode.Html,
                    cancellationToken: cancellationToken);
            }
        }

        private Task<Message> GetMainMenu(long chatId)
        {
            var command = new GetMainMenuCommand();
            command.ChatId = chatId;

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
