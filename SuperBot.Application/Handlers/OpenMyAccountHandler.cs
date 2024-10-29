using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using System.Text;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Handlers.Base;

namespace SuperBot.Application.Handlers
{
    public class OpenMyAccountHandler(ITelegramBotClient _botClient, IServiceProvider _serviceProvider, ITranslationsService _translationsService, IMediator _mediator) : DialogCommandHandler<OpenMyAccountCommand>(_mediator, _translationsService), IRequestHandler<OpenMyAccountCommand, Message>
    {
        public async Task<Message> Handle(OpenMyAccountCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(request.Name, request.UserID, await GetBalanceAsync(request.UserID)),
                parseMode: ParseMode.Html,
                replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        private async Task<decimal> GetBalanceAsync(long userId)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            return (await userRepository.GetUserByIdAsync(userId)).Balance;//TODO
        }

        public string GetMenuText(string name, long userID, decimal balance)
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.Account}:</u></b>");
            stringBuilder.AppendLine(string.Format(_translationsService.Translation.AccountBody, name, userID, balance));
            //stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.ReferralProgram, _translationsService.Translation.ReferralProgram));
            //stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.SteamTopUp, _translationsService.Translation.SteamTopUp));
            //stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.WithdrawFunds, _translationsService.Translation.WithdrawFunds));
            //stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.PurchaseHistory, _translationsService.Translation.PurchaseHistory));
            return stringBuilder.ToString();
        }

        private string GetFormat(string commandKey, string commandValue)
        {
            return $"{commandKey} - {commandValue}";
        }

        private InlineKeyboardMarkup GetKeyboard(long chatId)
        {
            var inlineKeyboard = new List<List<InlineKeyboardButton>>();

            var buttons = new List<InlineKeyboardButton>
            {
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.ReferralProgram, _translationsService.KeyboardKeys.ReferralProgram),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.TopUpBalance, _translationsService.KeyboardKeys.TopUpBalance),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.WithdrawFunds, _translationsService.KeyboardKeys.WithdrawFunds),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.PurchaseHistory, _translationsService.KeyboardKeys.PurchaseHistory)
            };

            // Разбиваем на строки по 2 кнопки в каждой
            for (int i = 0; i < buttons.Count; i += 2)
            {
                var row = new List<InlineKeyboardButton>();

                // Добавляем первую кнопку в строке
                row.Add(buttons[i]);

                // Добавляем вторую кнопку в строке, если есть
                if (i + 1 < buttons.Count)
                {
                    row.Add(buttons[i + 1]);
                }

                // Добавляем строку с двумя кнопками в клавиатуру
                inlineKeyboard.Add(row);
            }

            // Создаем клавиатуру
            return new InlineKeyboardMarkup(inlineKeyboard);
        }
    }
}
