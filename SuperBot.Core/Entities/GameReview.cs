using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace SuperBot.Core.Entities
{
    public enum ReviewStatus
    {
        Published,
        Hidden,
        Pending
    }

    public class GameReview
    {
        public string Id { get; set; }
        public string GameId { get; set; }
        public string UserId { get; set; }
        public string UserName { get; set; }
        /// <summary>
        /// Аватар автора. В базе НЕ хранится: подставляется при чтении из профиля по
        /// <see cref="UserId"/>. Снимок в отзыв заморозил бы и картинку, и метку версии —
        /// сменивший аватар человек остался бы со старым лицом под старыми отзывами, а
        /// удаливший — с мёртвой ссылкой.
        /// </summary>
        public string? AvatarUrl { get; set; }
        public bool VerifiedPurchase { get; set; }
        /// <summary>Под каким именем записан заказ-покупка (UserName заказа) — по нему возврат находит отзыв.
        /// Это email покупателя: на витрину не отдаётся.</summary>
        [JsonIgnore]
        public string? BuyerKey { get; set; }
        /// <summary>Покупку вернули. Отзыв остаётся и считается, витрина ставит пометку «Refunded».</summary>
        public bool Refunded { get; set; }
        public int Rating { get; set; }
        public double? PlaytimeHours { get; set; }
        public string Text { get; set; }
        public List<ReviewImage> Images { get; set; } = new();
        /// <summary>
        /// Вердикт выводится из оценки (см. <see cref="Services.ReviewVerdict"/>), не хранится и не
        /// принимается от клиента: true — 4–5 звёзд, false — 1–2, null — нейтральная тройка.
        /// </summary>
        public bool? Recommend => Services.ReviewVerdict.FromRating(Rating);
        public DateTime CreatedAt { get; set; }
        /// <summary>Любое изменение записи, в том числе модерацией и жалобой. Для витрины не годится.</summary>
        public DateTime? UpdatedAt { get; set; }
        /// <summary>Когда автор сам правил текст или оценку — витрина пишет «Edited …». Модерация сюда не пишет.</summary>
        public DateTime? EditedAt { get; set; }

        /// <summary>
        /// Прошлые версии отзыва, старшие первыми: что было до каждой правки автора. Только для
        /// модератора — читателю, как у Steam и Amazon, показывается лишь дата правки. Нужны, когда
        /// текст переписали уже под жалобами или заменили после набранных голосов «полезно».
        /// </summary>
        [JsonIgnore]
        public List<ReviewRevision> Revisions { get; set; } = new();
        public int HelpfulCount { get; set; }
        public ReviewStatus Status { get; set; } = ReviewStatus.Published;

        /// <summary>Сколько раз пожаловались. Жалоба переводит отзыв в Pending до решения модератора.</summary>
        public int ReportCount { get; set; }
        public DateTime? LastReportedAt { get; set; }
    }

    /// <summary>Версия отзыва, которую автор заменил правкой.</summary>
    public class ReviewRevision
    {
        public string Text { get; set; } = string.Empty;
        public int Rating { get; set; }
        public double? PlaytimeHours { get; set; }
        /// <summary>Когда эту версию заменили.</summary>
        public DateTime ReplacedAt { get; set; }
        /// <summary>На момент правки на отзыв уже были жалобы — модератору стоит сравнить версии.</summary>
        public bool UnderReport { get; set; }
    }

    public class ReviewImage
    {
        public string Url { get; set; }
        public string ThumbUrl { get; set; }
    }
}
