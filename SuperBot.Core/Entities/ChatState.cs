
namespace SuperBot.Core.Entities
{
    public class UserState
    {
        public string ChoseSteamLogin { get; set; }
        public decimal ChoseAmountOfInvestment { get; set; }
        public string ChoseCard { get; set; }
    }

    public class ChatState
    {
        public UserState UserState { get; set; }
        public DialogState DialogState { get; set; }
        public DateTime LastInteractionTime { get; set; }
    }
}
