using MediatR;
using SuperBot.Application.Commands.BuyGame;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Commands.Telegram.Base;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers.Telegram.Base
{
    public abstract class DialogCommandHandler<TCommand>(IMediator _mediator, ITranslationsService _translateService)
    {
        // Словарь для сопоставления типов команд с состояниями, в которые он будет переводить
        protected Dictionary<Type, DialogState> CommandStateMapping => new Dictionary<Type, DialogState>
        {
            { typeof(OpenBuyGameCommand), DialogState.BuyGame },
            { typeof(BuyGameCommand), DialogState.MainMenu },

            { typeof(GetMainMenuCommand), DialogState.MainMenu },
            { typeof(OpenMyAccountCommand), DialogState.Account },
            { typeof(OpenReferralProgramCommand), DialogState.Referral },
            { typeof(OpenStartCommand), DialogState.MainMenu },
            { typeof(ErrorCommand), DialogState.MainMenu }
        };

        protected async Task<Message> SendToChangeDialogStateAsync(long chatId, string text = "")
        {
            var commandType = typeof(TCommand);

            // Проверяем, есть ли команда в словаре
            if (CommandStateMapping.TryGetValue(commandType, out var dialogState))
            {
                var changeStateCommand = new ChangeDialogStateCommand
                {
                    ChatId = chatId,
                    DialogState = dialogState,
                    Text = text
                };

                // Отправляем команду для смены состояния
                return await _mediator.Send(changeStateCommand);
            }
            else
            {
                throw new NotImplementedException(_translateService.Translation.TransitionForThisCommandIsNotImplemented);
            }
        }
    }
}
