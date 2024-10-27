using MediatR;
using SuperBot.Application.Commands;
using SuperBot.Application.Commands.Base;
using SuperBot.Application.Commands.InternationalTransfers;
using SuperBot.Application.Commands.Investment;
using SuperBot.Application.Commands.TopUp;
using SuperBot.Application.Commands.WithdrawalOfFunds;
using SuperBot.Application.Handlers.WithdrawalOfFunds;
using SuperBot.Core.Entities;
using Telegram.Bot.Types;
using static System.Runtime.InteropServices.JavaScript.JSType;

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

            { typeof(OpenTopUpSteamCommand), DialogState.TopUpWithLogin },
            { typeof(PrepareTopUpSteamCommand), DialogState.TopUpWithData },
            { typeof(TopUpSteamCommand), DialogState.MainMenu },


            { typeof(OpenTopUpAccountCommand), DialogState.TopUpAccountWithData },
            { typeof(TopUpAccountCommand), DialogState.MainMenu },

            { typeof(OpenWithdrawalOfFundsCommand), DialogState.WithdrawalOfFundsWithCard },
            { typeof(PrepareWithdrawalOfFundsCommand), DialogState.WithdrawalOfFundsWithData },
            { typeof(WithdrawalOfFundsCommand), DialogState.MainMenu },

            //{ typeof(OpenInvestmentCommand), DialogState.AwaitingInvestmentAmount },
            { typeof(OpenInvestmentCommand), DialogState.MainMenu },
            { typeof(StartInvestmentCommand), DialogState.AwaitingInvestmentAmount },
            { typeof(EnterInvestmentAmountCommand), DialogState.AwaitingInvestmentDuration },
            { typeof(EnterInvestmentDurationCommand), DialogState.InvestmentDecision },
            { typeof(InvestmentDecisionCommand), DialogState.MainMenu },


            { typeof(OpenInternationalTransfersCommand), DialogState.InternationalTransfers },
            { typeof(InternationalTransfersCommand), DialogState.MainMenu },
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
                throw new NotImplementedException("Переход для данной команды не реализован");
            }
        }
    }
}
