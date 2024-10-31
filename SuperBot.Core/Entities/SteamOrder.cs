using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Entities
{
    public class SteamOrder
    {
        public string Id { get; set; }
        public string Username { get; set; }
        public string SteamLogin { get; set; }
        public decimal Amount { get; set; }
        public decimal TotalAmount { get; set; }
        public bool IsPaid { get; set; }
        public string PayId { get; set; }
    }
}
