using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Core.Entities
{
    public class Settings
    {
        public Guid Id { get; set; }
        public string[] GameCategories { get; set; }
    }
}
