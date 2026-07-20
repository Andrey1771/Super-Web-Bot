namespace SuperBot.Core.Payments
{
    /// <summary>
    /// Пересчёт цены из USD в Telegram Stars (XTR). Ставка настраивается (BotPayments:StarsPerUsd).
    /// Это демо-конвертация для оплаты внутри бота — не биржевой курс.
    /// </summary>
    public static class StarPrice
    {
        public const int DefaultStarsPerUsd = 50;

        public static int FromUsd(decimal usd, int starsPerUsd = DefaultStarsPerUsd)
        {
            if (starsPerUsd <= 0)
            {
                starsPerUsd = DefaultStarsPerUsd;
            }

            var stars = (int)Math.Round(usd * starsPerUsd, MidpointRounding.AwayFromZero);
            return Math.Max(1, stars); // Telegram требует минимум 1 звезду
        }
    }
}
