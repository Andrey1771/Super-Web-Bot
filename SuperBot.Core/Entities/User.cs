
namespace SuperBot.Core.Entities
{
    public class User
    {
        public Guid Id { get; set; }
        public long UserId { get; set; }
        public string Username { get; set; }
        public decimal Balance { get; set; }
        public int CountOfInvited { get; set; }
        public decimal Discount { get; set; }
        public int QuantityBeforeIncrease { get; set; }
        public decimal ChoseAmountOfTopUp { get; set; }
        public string ChoseSteamLogin { get; set; }
        public string ChoseCard { get; set; }
        public decimal ChoseAmountOfInvestment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
