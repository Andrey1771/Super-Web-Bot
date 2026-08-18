namespace SuperBot.Core.Payments
{
    /// <summary>Платёжный рельс. Значения совпадают с тем, что понимает витрина.</summary>
    public enum PaymentMethod
    {
        /// <summary>Карты через Stripe.</summary>
        Card,
        /// <summary>Криптовалюта через BTCPay.</summary>
        Crypto,
        /// <summary>Telegram Stars (XTR) — только в боте и мини-приложении.</summary>
        TelegramStars,
        /// <summary>ЮKassa — карты и СБП в рублях.</summary>
        YooKassa
    }

    /// <summary>Способ оплаты и его пригодность для выбранной валюты.</summary>
    public sealed record PaymentMethodOption(PaymentMethod Method, bool Available, string? Reason);

    /// <summary>
    /// Какими способами можно заплатить в выбранной валюте.
    ///
    /// Это главное ограничение мультивалютности: показать цену можно в чём угодно, а списать —
    /// только тем, что умеет провайдер. Без этой проверки покупатель выбирает евро, доходит
    /// до чекаута и упирается в форму, которая не может принять его деньги.
    ///
    /// Знание о рельсах собрано в одном месте намеренно: раньше оно было размазано по контроллерам
    /// (крипта — по флагу конфигурации, Stars — в обработчике бота, ЮKassa — в своём сервисе),
    /// и ответить на вопрос «чем платят за евро» было негде.
    /// </summary>
    public static class PaymentMethodAvailability
    {
        /// <summary>Валюта Telegram Stars.</summary>
        public const string StarsCurrency = "XTR";

        /// <summary>Единственная валюта ЮKassa.</summary>
        public const string YooKassaCurrency = "RUB";

        /// <summary>
        /// Что доступно в этой валюте.
        /// </summary>
        /// <param name="currency">Валюта корзины.</param>
        /// <param name="baseCurrency">Базовая валюта каталога.</param>
        /// <param name="enabled">Рельсы, включённые конфигурацией (ключи не настроены — рельса нет).</param>
        /// <param name="cardCurrencies">
        /// Валюты, которые принимает аккаунт Stripe. Пустой список означает «ограничений не задано»:
        /// список валют аккаунта знает только сам провайдер, и выдумывать его за него мы не будем.
        /// </param>
        public static IReadOnlyList<PaymentMethodOption> For(
            string currency,
            string baseCurrency,
            IReadOnlyCollection<PaymentMethod> enabled,
            IReadOnlyCollection<string>? cardCurrencies = null)
        {
            var normalized = (currency ?? string.Empty).Trim().ToUpperInvariant();
            var options = new List<PaymentMethodOption>();

            foreach (var method in new[] { PaymentMethod.Card, PaymentMethod.Crypto, PaymentMethod.TelegramStars, PaymentMethod.YooKassa })
            {
                if (!enabled.Contains(method))
                {
                    continue;
                }

                options.Add(Evaluate(method, normalized, baseCurrency, cardCurrencies));
            }

            return options;
        }

        private static PaymentMethodOption Evaluate(
            PaymentMethod method,
            string currency,
            string baseCurrency,
            IReadOnlyCollection<string>? cardCurrencies)
        {
            switch (method)
            {
                case PaymentMethod.Card:
                    // Список валют аккаунта задаётся конфигурацией. Пустой — не проверяем:
                    // Stripe принимает больше сотни валют, и запрещать их своим списком вредно.
                    if (cardCurrencies is null || cardCurrencies.Count == 0 ||
                        cardCurrencies.Any(code => string.Equals(code?.Trim(), currency, StringComparison.OrdinalIgnoreCase)))
                    {
                        return new PaymentMethodOption(method, true, null);
                    }

                    return new PaymentMethodOption(method, false, $"Cards don't accept {currency} yet.");

                case PaymentMethod.Crypto:
                    // Инвойс BTCPay выставляется в базовой валюте, конвертацию делает сам BTCPay.
                    // Пересчитать чужую валюту в базовую мы пока не умеем — курсы это Этап 4.
                    return string.Equals(currency, baseCurrency, StringComparison.OrdinalIgnoreCase)
                        ? new PaymentMethodOption(method, true, null)
                        : new PaymentMethodOption(method, false, $"Crypto payments are billed in {baseCurrency}.");

                case PaymentMethod.TelegramStars:
                    // Звёзды — собственная валюта Telegram, товар в ней оценивается пересчётом,
                    // а не выбором покупателя. В вебе их не показывают вовсе.
                    return string.Equals(currency, StarsCurrency, StringComparison.OrdinalIgnoreCase)
                        ? new PaymentMethodOption(method, true, null)
                        : new PaymentMethodOption(method, false, "Telegram Stars are available inside the bot.");

                case PaymentMethod.YooKassa:
                    return string.Equals(currency, YooKassaCurrency, StringComparison.OrdinalIgnoreCase)
                        ? new PaymentMethodOption(method, true, null)
                        : new PaymentMethodOption(method, false, $"This method accepts {YooKassaCurrency} only.");

                default:
                    return new PaymentMethodOption(method, false, "Unknown payment method.");
            }
        }

        /// <summary>Есть ли хоть один способ заплатить. Если нет — валюту показывать нельзя.</summary>
        public static bool AnyAvailable(IReadOnlyList<PaymentMethodOption> options) =>
            options.Any(option => option.Available);
    }
}
