using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Core.Entities;
using Telegram.Bot.Types;

namespace SuperBot.Application.Handlers.Base
{
    public abstract class DialogCommandHandler<TCommand>(IMediator _mediator)
    {
        // Словарь для сопоставления типов команд с состояниями, в которые он будет переводить
        protected Dictionary<Type, DialogState> CommandStateMapping => new Dictionary<Type, DialogState>
        {
            { typeof(BuyGameCommand), DialogState.MainMenu },
            { typeof(GetMainMenuCommand), DialogState.MainMenu },
            { typeof(OpenMyAccountCommand), DialogState.Account },
            { typeof(OpenReferralProgramCommand), DialogState.Ref },
            { typeof(OpenStartCommand), DialogState.MainMenu },

            { typeof(PrepareTopUpSteamCommand), DialogState.TopUpWithLogin },
            { typeof(PrepareSecondTopUpSteamCommand), DialogState.TopUpWithData },
            { typeof(TopUpSteamCommand), DialogState.MainMenu }
            // Добавляйте другие команды и их состояния
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
                throw new NotImplementedException("Переход для данной команды не реализован");
            }
        }
    }
}
