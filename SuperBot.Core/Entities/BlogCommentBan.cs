namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Бан на комментирование: пользователь с этим userId не может оставлять
    /// комментарии, пока запись существует. Снятие бана — удаление записи.
    /// </summary>
    public class BlogCommentBan
    {
        public string Id { get; set; }
        public string UserId { get; set; }
        public string BannedBy { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
