
namespace SuperBot.Core.Entities
{
    public class Resources
    {
        public Translations Translations { get; set; }
        public KeyboardKeys KeyboardKeys { get; set; }
    }

    public class Translations
    {
        public LanguageTranslation Ru { get; set; }  // Поскольку у нас только русский, можно явно указать
    }

    public class LanguageTranslation
    {
        public string BotMenu { get; set; }
        public string BuySteamGames { get; set; }
        public string NavigateToGamePurchase { get; set; }
        public string NotFoundGameError { get; set; }
        public string MadeOrderGame { get; set; }
        public string InternationalTransfers { get; set; }
        public string Investments { get; set; }
        public string StartInvest { get; set; }
        public string Account { get; set; }
        public string SelectAction { get; set; }
        public string SteamTopUp { get; set; }
        public string Store { get; set; }
        public string ReferralProgram { get; set; }
        public string TopUpBalance { get; set; }
        public string WithdrawFunds { get; set; }
        public string PurchaseHistory { get; set; }

        public string AccountBody { get; set; }

        public string ReferralProgramBody { get; set; }
        public string ErrorOccurred { get; set; }
        public string UserNotFound { get; set; }
        public string DescriptionBotStart { get; set; }
        public string WithdrawalOfFundsMessage { get; set; }
        public string EnterAmountInRubles { get; set; }
        public string EnterCardNumberToWithdrawFunds { get; set; }
        public string RequestTopUp { get; set; }
        public string TopUpAmount { get; set; }
        public string TopUpSteam { get; set; }
        public string NotifyTopUpSteam { get; set; }
        public string EnterSteamLogin { get; set; }
        public string TransitionForThisCommandIsNotImplemented { get; set; }
        public string RequestAccepted { get; set; }
        public string ProvideTransferDetails { get; set; }
        public string EnterInvestmentAmount { get; set; }
        public string InvestInYourFuture { get; set; }
        public string SomeSumMoreThenZero { get; set; }
        public string EnterTimeOfInvest { get; set; }
        public string FollowLinkToPay { get; set; }
        public string IfYouHaveQuestions { get; set; }
        public string MinimumInvestmentPeriod { get; set; }
        public string Invest { get; set; }
        public string Reject { get; set; }
        public string SumTimeValueTotal { get; set; }
    }

    public class KeyboardKeys
    {
        public string Start { get; set; }
        public string BuySteamGames { get; set; }
        public string InternationalTransfers { get; set; }
        public string Investments { get; set; }
        public string StartInvest { get; set; }
        public string Account { get; set; }
        public string SelectAction { get; set; }
        public string SteamTopUp { get; set; }
        public string Store { get; set; }
        public string ReferralProgram { get; set; }
        public string TopUpBalance { get; set; }
        public string WithdrawFunds { get; set; }
        public string PurchaseHistory { get; set; }
    }
}
