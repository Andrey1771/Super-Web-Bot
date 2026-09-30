namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Чем оплачен заказ — словами для покупателя: «Visa •••• 4242», «Apple Pay · Visa •••• 4242», «PayPal»,
    /// «Bitcoin». Через полгода человек не помнит, чем платил, а при возврате это первый вопрос; письмо о
    /// возврате с «деньги вернутся на Visa •••• 4242» снимает его сразу.
    /// </summary>
    public static class PaymentInstrument
    {
        private static readonly Dictionary<string, string> Brands = new(StringComparer.OrdinalIgnoreCase)
        {
            ["visa"] = "Visa",
            ["mastercard"] = "Mastercard",
            ["amex"] = "American Express",
            ["discover"] = "Discover",
            ["diners"] = "Diners Club",
            ["jcb"] = "JCB",
            ["unionpay"] = "UnionPay",
            ["maestro"] = "Maestro",
            ["mir"] = "Mir",
            ["cartes_bancaires"] = "Cartes Bancaires",
            ["eftpos_au"] = "eftpos"
        };

        private static readonly Dictionary<string, string> Wallets = new(StringComparer.OrdinalIgnoreCase)
        {
            ["apple_pay"] = "Apple Pay",
            ["google_pay"] = "Google Pay",
            ["samsung_pay"] = "Samsung Pay",
            ["link"] = "Link"
        };

        /// <summary>Подпись способа оплаты; «Card», если про карту известно только то, что это карта.</summary>
        public static string Describe(Order order)
        {
            switch (order.PaymentProvider?.ToLowerInvariant())
            {
                case "btcpay":
                    return "Bitcoin";
                case "stars":
                    return "Telegram Stars";
            }

            var type = order.PaidWithType?.ToLowerInvariant();
            if (type is "paypal")
            {
                return "PayPal";
            }
            if (type is "link")
            {
                return "Link";
            }
            if (type is not null && type is not "card")
            {
                // Другой способ Stripe (SEPA, iDEAL и т. п.): его название как есть, с большой буквы.
                return char.ToUpperInvariant(type[0]) + type[1..].Replace('_', ' ');
            }

            var card = CardLabel(order.PaidWithBrand, order.PaidWithLast4);
            if (!string.IsNullOrEmpty(order.PaidWithWallet) && Wallets.TryGetValue(order.PaidWithWallet, out var wallet))
            {
                return card == "Card" ? wallet : $"{wallet} · {card}";
            }
            return card;
        }

        /// <summary>«Visa •••• 4242»; без бренда — «Card •••• 4242»; без цифр — просто бренд или «Card».</summary>
        public static string CardLabel(string? brand, string? last4)
        {
            var name = string.IsNullOrWhiteSpace(brand)
                ? "Card"
                : Brands.TryGetValue(brand.Trim(), out var known) ? known : Capitalize(brand.Trim());
            return string.IsNullOrWhiteSpace(last4) ? name : $"{name} •••• {last4.Trim()}";
        }

        private static string Capitalize(string value) => char.ToUpperInvariant(value[0]) + value[1..];
    }
}
