using System;

namespace SuperBot.Core.Entities
{
    /// <summary>Причина жалобы на отзыв — из короткого списка, как у Steam и Amazon. Свободный текст — в комментарии.</summary>
    public enum ReviewReportReason
    {
        Spam,
        Abusive,
        OffTopic,
        PersonalData,
        Malware,
        Other
    }

    /// <summary>
    /// Жалоба на отзыв: одна от одного пользователя на один отзыв. Жалоба — заявка модератору, а не действие
    /// над отзывом: отзыв прячется только по порогу или по тяжёлой причине (см. ReviewReportPolicy).
    /// </summary>
    public class GameReviewReport
    {
        public string Id { get; set; }
        public string ReviewId { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        public ReviewReportReason Reason { get; set; }
        public string? Comment { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
