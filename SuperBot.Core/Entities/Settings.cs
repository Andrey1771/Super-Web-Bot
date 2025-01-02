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
    }
}
