namespace SuperBot.Core.Entities
{
    public class GameCategory
    {
        public string Tag { get; set; }
        /// <summary>Английское название — значение фильтров и адресов витрины; показывается, когда перевода нет.</summary>
        public string Title { get; set; }
        /// <summary>Названия на языках сайта (ru/uk/pl → текст). Пусто — везде английское.</summary>
        public Dictionary<string, string>? Titles { get; set; }

        /// <summary>Название на языке покупателя; нет перевода или языка — английское.</summary>
        public string TitleFor(string? locale) =>
            locale is not null && Titles is not null && Titles.TryGetValue(locale, out var title) && !string.IsNullOrWhiteSpace(title)
                ? title
                : Title;
    }

    public class Settings
    {
        public Guid Id { get; set; }
        /// <summary>Жанры игр (Tag — адрес и значение Game.Genre, Title — название). Порядок — порядок в фильтрах.</summary>
        public GameCategory[] GameCategories { get; set; }
        /// <summary>Категории софта (Tag — адрес, Title — название). Пусто — засеваются значениями по умолчанию.</summary>
        public GameCategory[]? SoftwareCategories { get; set; }
        // Контактная почта поддержки: редактируется в админке, используется по всему сайту (mailto и т.п.).
        public string? SupportEmail { get; set; }
    }
}
