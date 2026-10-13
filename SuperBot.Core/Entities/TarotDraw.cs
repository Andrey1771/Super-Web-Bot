namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Факт «вытянутой карты удачи»: кто, когда, какой процент выпал и какой одноразовый
    /// промокод создан. По этой записи считается кулдаун и статистика в админке.
    /// </summary>
    public class TarotDraw
    {
        public string? Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string? PromoCodeId { get; set; }
        public decimal Percent { get; set; }
        public DateTime DrawnAt { get; set; }
        public DateTime ExpiresAt { get; set; }
    }
}
