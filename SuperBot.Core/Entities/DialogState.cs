namespace SuperBot.Core.Entities
{
    public enum DialogState
    {
        MainMenu,
        BuyGame,
        Account,
        Ref,//TODO
        TopUpWithLogin,
        TopUpWithData,

        TopUpAccountWithData,


        WithdrawalOfFundsWithData,
        WithdrawalOfFundsWithCard,


        InvestmentDecision,
        AwaitingInvestmentAmount,    // Ожидание ввода суммы
        AwaitingInvestmentDuration,  // Ожидание срока инвестиций
    }
}
