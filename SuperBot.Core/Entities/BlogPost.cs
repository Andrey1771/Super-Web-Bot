namespace SuperBot.Core.Entities
{
    public class BlogPost
    {
        public string Id { get; set; }
        public string ExternalId { get; set; }
        public string Slug { get; set; }
        public string Title { get; set; }
        public string Excerpt { get; set; }
        /// <summary>Переводы заголовка и анонса (ru/uk/pl → текст); английские поля выше — основные.</summary>
        public Dictionary<string, string>? TitleI18n { get; set; }
        public Dictionary<string, string>? ExcerptI18n { get; set; }
        public string CoverAssetId { get; set; }
        public string CoverUrl { get; set; }
        public string Status { get; set; }
        public DateTime? PublishedAt { get; set; }
        public DateTime? ScheduledAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string AuthorId { get; set; }
        public string AuthorName { get; set; }
        public string[] Tags { get; set; } = Array.Empty<string>();
        /// <summary>Подписи тегов по позициям (язык → список той же длины); сами теги — английские значения фильтра.</summary>
        public Dictionary<string, List<string>>? TagsI18n { get; set; }
        public string[] Topics { get; set; } = Array.Empty<string>();
        public int? ReadingTime { get; set; }
        public string CurrentVersionId { get; set; }
        public int? ViewCount { get; set; }
        public int? EditorScore { get; set; }
        public bool Featured { get; set; }
        public bool BlogHomeFeatured { get; set; }
    }
}
