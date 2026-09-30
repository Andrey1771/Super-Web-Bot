namespace SuperBot.Core.Cashback
{
    /// <summary>
    /// Настройки кэшбэка. Секция конфигурации — <c>Cashback</c>.
    ///
    /// Все суммы — в долларах: баланс хранится в базовой валюте магазина, а в валюту заказа
    /// пересчитывается только при показе и оплате (решение от 14.09.2026).
    /// </summary>
    public class CashbackOptions
    {
        /// <summary>
        /// Выключенный кэшбэк не начисляется и не списывается; уже накопленное остаётся. Включённый работает
        /// для всех оплаченных заказов — даты запуска нет: сайт в разработке, поддерживать «старые» заказы не нужно.
        /// </summary>
        public bool Enabled { get; set; } = true;

        /// <summary>Сколько дней начисление ждёт после выдачи ключей, прежде чем станет доступным.</summary>
        public int PendingDays { get; set; } = 14;

        /// <summary>Срок жизни начисления в месяцах с даты начисления. 0 — не сгорает.</summary>
        public int ExpiryMonths { get; set; } = 12;

        /// <summary>Письма покупателю: «кэшбэк стал доступен» и «скоро сгорит».</summary>
        public bool EmailNotices { get; set; } = true;

        /// <summary>За сколько дней до сгорания напоминать. 0 — не напоминать.</summary>
        public int ExpiryReminderDays { get; set; } = 30;

        /// <summary>
        /// Сколько долларов (в пересчёте на валюту заказа) покупатель всегда платит картой.
        /// Stripe не проводит платёж ниже своего минимума, а путь оформления без платежа пока не сделан.
        /// </summary>
        public decimal MinCardPaymentUsd { get; set; } = 1.00m;

        /// <summary>
        /// Уровни. Пустой список — уровни по умолчанию (<see cref="DefaultTiers"/>).
        /// Список намеренно пустой по умолчанию: привязка конфигурации к спискам дописывает элементы
        /// к уже существующим, и заполненный здесь список склеивался бы с заданным в appsettings.
        /// </summary>
        public List<CashbackTierOptions> Tiers { get; set; } = new();

        public static IReadOnlyList<CashbackTierOptions> DefaultTiers { get; } = new[]
        {
            new CashbackTierOptions { Id = "rookie", Name = "Rookie", Percent = 3m, SpendThresholdUsd = 0m },
            new CashbackTierOptions { Id = "veteran", Name = "Veteran", Percent = 5m, SpendThresholdUsd = 200m },
            new CashbackTierOptions { Id = "elite", Name = "Elite", Percent = 7m, SpendThresholdUsd = 1000m },
            new CashbackTierOptions { Id = "legend", Name = "Legend", Percent = 10m, SpendThresholdUsd = 3000m },
        };

        /// <summary>Уровни по возрастанию порога; первый всегда открыт с нуля.</summary>
        public IReadOnlyList<CashbackTierOptions> EffectiveTiers =>
            (Tiers.Count > 0 ? Tiers : DefaultTiers)
                .OrderBy(tier => tier.SpendThresholdUsd)
                .ToList();

        /// <summary>Уровень при такой сумме покупок.</summary>
        public CashbackTierOptions TierFor(decimal qualifyingSpendUsd)
        {
            var tiers = EffectiveTiers;
            return tiers.LastOrDefault(tier => qualifyingSpendUsd >= tier.SpendThresholdUsd) ?? tiers[0];
        }

    }

    public class CashbackTierOptions
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public decimal Percent { get; set; }
        public decimal SpendThresholdUsd { get; set; }
        /// <summary>Картинка уровня из медиатеки. Пусто — у встроенных уровней своя 3D-медаль, у новых запасная.</summary>
        public string? ImageUrl { get; set; }
    }
}
