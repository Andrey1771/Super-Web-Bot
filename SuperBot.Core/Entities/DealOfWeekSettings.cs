namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Настройка баннера «Deal of the week» на главной (синглтон-документ, правится в админке).
    /// HeroGameId — игра-герой; само предложение (процент/срок) живёт в её GameDiscount,
    /// отдельного прайса здесь нет — источник цены один на весь проект.
    /// WingGameIds — обложки «кулис» по краям баннера.
    /// </summary>
    public class DealOfWeekSettings
    {
        public string Id { get; set; } = "default";
        public string? HeroGameId { get; set; }
        public List<string> WingGameIds { get; set; } = new();
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
