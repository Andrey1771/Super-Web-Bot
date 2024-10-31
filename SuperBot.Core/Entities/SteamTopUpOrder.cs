using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Entities
{
    public class SteamTopUpOrder
    {
        public string Id { get; set; }
        public string SteamName { get; set; }
        public string UserName { get; set; }
        public bool IsPaid { get; set; }
        public string PayId { get; set; }
        public DateTime OrderDate { get; set; }
    }
}
