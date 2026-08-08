namespace SuperBot.Core.Entities
{
    /// <summary>Ступень редкости «карты удачи»: процент скидки и вес при розыгрыше.</summary>
    public class TarotLuckyTier
    {
        public decimal Percent { get; set; }
        public int Weight { get; set; }
    }

    /// <summary>
    /// Настройка «карты удачи» (сказочное таро на главной): включена ли механика, кулдаун
    /// между попытками, срок жизни выданного промокода и таблица редкостей.
    /// Синглтон-документ, правится в админке.
    /// </summary>
    public class TarotSettings
    {
        /// <summary>Карта тянется раз в сутки — это «карта дня», а не бесконечный автомат.</summary>
        private const int DefaultCooldownHours = 24;
        /// <summary>Код живёт сутки: ограниченность предложения и есть смысл механики.</summary>
        private const int DefaultCodeTtlHours = 24;

        // Стартовая таблица редкостей. Веса — доли в общем розыгрыше (70+25+5 = 100),
        // проценты — размер скидки. Средняя выдача ≈ 6.5%: безопасно для маржи,
        // но «эпическая» карта достаточно редкая, чтобы вызывать азарт.
        private const decimal CommonPercent = 5m;
        private const int CommonWeight = 70;
        private const decimal RarePercent = 10m;
        private const int RareWeight = 25;
        private const decimal EpicPercent = 15m;
        private const int EpicWeight = 5;

        public string Id { get; set; } = "default";
        public bool Enabled { get; set; } = true;

        /// <summary>
        /// Карта — награда покупателю, а не приманка: без покупок в истории розыгрыш закрыт.
        /// Это же главный барьер против мультиаккаунтов — завести новый аккаунт легко,
        /// а вот совершить покупку ради скидки в 5% смысла нет.
        /// </summary>
        public bool RequirePurchase { get; set; } = true;

        public int CooldownHours { get; set; } = DefaultCooldownHours;
        public int CodeTtlHours { get; set; } = DefaultCodeTtlHours;
        public List<TarotLuckyTier> Tiers { get; set; } = DefaultTiers();
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>Стартовый расклад: обычная / редкая / эпическая карта.</summary>
        public static List<TarotLuckyTier> DefaultTiers() => new()
        {
            new TarotLuckyTier { Percent = CommonPercent, Weight = CommonWeight },
            new TarotLuckyTier { Percent = RarePercent, Weight = RareWeight },
            new TarotLuckyTier { Percent = EpicPercent, Weight = EpicWeight }
        };
    }
}
