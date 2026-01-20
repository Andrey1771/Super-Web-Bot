
namespace SuperBot.Core.Entities
{
    public class Order
    {
        public Guid Id { get; set; }
        public string GameId { get; set; }
        public string GameName { get; set; }
        public string UserName { get; set; }
        public bool IsPaid { get; set; }
        public DateTime OrderDate { get; set; }
    }
}
