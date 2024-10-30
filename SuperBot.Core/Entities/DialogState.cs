namespace SuperBot.Core.Entities
{
    public enum DialogState
    {
        MainMenu,
        BuyGame,
        Account,
        Referral,
        TopUpWithLogin,
        TopUpWithData,

        TopUpAccountWithData,


        WithdrawalOfFundsWithData,
        WithdrawalOfFundsWithCard,


        InvestmentDecision,
        AwaitingInvestmentAmount,    // Ожидание ввода суммы
        AwaitingInvestmentDuration,  // Ожидание срока инвестиций

        InternationalTransfers,
    }
}
