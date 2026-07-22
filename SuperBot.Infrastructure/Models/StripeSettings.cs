using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.Models
{
    public class StripeSettings
    {
        public string SecretKey { get; set; }
        public string PublishableKey { get; set; }

        /// <summary>whsec_… из Stripe Dashboard → Webhooks. Нужен для проверки подписи вебхука.</summary>
        public string WebhookSecret { get; set; }
    }
}
