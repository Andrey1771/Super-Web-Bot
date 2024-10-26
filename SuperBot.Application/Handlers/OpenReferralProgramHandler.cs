using MediatR;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands;
using SuperBot.Application.Handlers.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using System.Text;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers
{
    public class OpenReferralProgramHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator) : DialogCommandHandler<OpenReferralProgramCommand>(_mediator), IRequestHandler<OpenReferralProgramCommand, Message>
    {
        public async Task<Message> Handle(OpenReferralProgramCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var userRepository = serviceScope.ServiceProvider.GetService(typeof(IUserRepository)) as IUserRepository;

            await SendToChangeDialogStateAsync(request.ChatId);

            // Получение данных о пользователе из MongoDB
            var user = await userRepository.GetUserDetailsAsync(request.UserId);

            if (user == null)
            {
                // Если пользователь не найден, можно отправить сообщение об ошибке
                return await _botClient.SendTextMessageAsync(
                    chatId: request.ChatId,
                    text: "Пользователь не найден.",
                    cancellationToken: cancellationToken);
            }

            var personalLink = GeneratePersonalLink(request.UserId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(user.CountOfInvited, user.Discount, user.QuantityBeforeIncrease, personalLink),
                parseMode: ParseMode.Html,
                replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        private string GeneratePersonalLink(long userId)//TODO Доделать персональную ссылку
        {
            return $"https://yourwebsite.com/referral/{userId}";
        }

        public string GetMenuText(int countOfInvited, decimal discount, int quantityBeforeIncrease, string personalLink)
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.ReferralProgram}:</u></b>");
            stringBuilder.AppendLine(string.Format(_translationsService.Translation.ReferralProgramBody, countOfInvited, discount, quantityBeforeIncrease, personalLink));
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
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.SteamTopUp, _translationsService.KeyboardKeys.SteamTopUp),
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
