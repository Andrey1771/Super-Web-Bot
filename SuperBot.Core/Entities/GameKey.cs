namespace SuperBot.Core.Entities
{
    public class GameKey
    {
        public string UserId { get; set; }
        public string GameId { get; set; }
        public string Key { get; set; }
        public string KeyType { get; set; }
        public DateTime IssuedAt { get; set; }
        public bool IsActive { get; set; }

        /// <summary>Кто залил ключ в пул (почта сотрудника). Пусто — импорт до появления поля.</summary>
        public string? AddedBy { get; set; }
        /// <summary>Кто выдал вручную (grant / deliver-keys). Пусто — автоматическая выдача при оплате.</summary>
        public string? IssuedBy { get; set; }
    }
}
