namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Комментарий читателя под статьёй новостей. Автор — либо гость (anonId + имя),
    /// либо залогиненный пользователь (userId хранится, но наружу не отдаётся).
    /// </summary>
    public class BlogComment
    {
        public string Id { get; set; }
        public string PostId { get; set; }
        public string UserId { get; set; }
        public string AnonId { get; set; }
        public string AuthorName { get; set; }
        public string Text { get; set; }

        /// <summary>«Visible» или «Hidden». Отсутствие значения читается как Visible.</summary>
        public string Status { get; set; } = BlogCommentStatus.Visible;

        public DateTime CreatedAt { get; set; }
    }

    public static class BlogCommentStatus
    {
        public const string Visible = "Visible";
        public const string Hidden = "Hidden";
    }
}
