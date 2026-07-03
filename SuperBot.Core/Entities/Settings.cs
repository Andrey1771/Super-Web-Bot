namespace SuperBot.Core.Entities
{
    public class GameCategory
    {
        public string Tag { get; set; }
        public string Title { get; set; }
    }

    public class Settings
    {
        public Guid Id { get; set; }
        public GameCategory[] GameCategories { get; set; }
        // Контактная почта поддержки: редактируется в админке, используется по всему сайту (mailto и т.п.).
        public string? SupportEmail { get; set; }
    }
}
