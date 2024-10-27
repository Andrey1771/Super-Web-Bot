
namespace SuperBot.Core.Entities
{
    public class Order
    {
        public string GameName { get; set; }
        public string UserName { get; set; }
        public bool IsPaid { get; set; }
        public DateTime OrderDate { get; set; }
    }
}
