
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
        public string ChooseGameToBuy { get; set; }
        public string MadeOrderGame { get; set; }
        public string Account { get; set; }
        public string SelectAction { get; set; }
        public string Store { get; set; }
        public string ReferralProgram { get; set; }

        public string AccountBody { get; set; }

        public string ReferralProgramBody { get; set; }
        public string ErrorOccurred { get; set; }
        public string UserNotFound { get; set; }
        public string DescriptionBotStart { get; set; }
        public string NotifyAdmin { get; set; }
        public string TransitionForThisCommandIsNotImplemented { get; set; }
        public string AccountLinkedSuccess { get; set; }
        public string AccountLinkFailed { get; set; }
        public string KeysDeliveredHeader { get; set; }
        public string WishlistDiscountAlert { get; set; }
        public string StarsInvoiceDescription { get; set; }
        public string StarsPaymentSuccess { get; set; }
        public string StarsPaymentPending { get; set; }
        public string StarsGameUnavailable { get; set; }
    }

    public class KeyboardKeys
    {
        public string Start { get; set; }
        public string BuySteamGames { get; set; }
        public string Account { get; set; }
        public string SelectAction { get; set; }
        public string Store { get; set; }
        public string ReferralProgram { get; set; }
    }
}
