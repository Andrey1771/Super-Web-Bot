using System;

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
        public string Account { get; set; }
        public string SelectAction { get; set; }
        public string SteamTopUp { get; set; }
        public string Store { get; set; }
        public string ReferralProgram { get; set; }
        public string TopUpBalance { get; set; }
        public string WithdrawFunds { get; set; }
        public string PurchaseHistory { get; set; }
    }

    public class KeyboardKeys
    {
        public string BuySteamGames { get; set; }
        public string InternationalTransfers { get; set; }
        public string Investments { get; set; }
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
