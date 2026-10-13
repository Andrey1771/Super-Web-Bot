using SuperBot.Core.Entities;

namespace SuperBot.Core.Services
{
    /// <summary>
    /// Когда жалобы снимают отзыв с витрины до решения модератора. Как у Steam: одна жалоба ничего не
    /// прячет — иначе любой вошедший убирал бы неугодный отзыв одним кликом, а случайный клик прятал бы
    /// чужой текст. Прячем по порогу разных жалобщиков; спам и вредоносные ссылки — сразу, там цена
    /// ожидания выше цены ошибки.
    /// </summary>
    public static class ReviewReportPolicy
    {
        public const int HideThreshold = 3;

        public static bool HidesImmediately(ReviewReportReason reason) =>
            reason is ReviewReportReason.Spam or ReviewReportReason.Malware;

        public static bool ShouldHide(ReviewReportReason latestReason, int distinctReporters) =>
            HidesImmediately(latestReason) || distinctReporters >= HideThreshold;
    }
}
