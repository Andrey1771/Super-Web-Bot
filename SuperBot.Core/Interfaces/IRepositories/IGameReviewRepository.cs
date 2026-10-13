using SuperBot.Core.Entities;

namespace SuperBot.Core.Interfaces.IRepositories
{
    public class GameReviewQuery
    {
        public string GameId { get; set; }
        public string Sort { get; set; } = "createdAt:desc";
        public int? Rating { get; set; }
        public bool? WithPlaytime { get; set; }
        public bool? WithImages { get; set; }
        public string Search { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 10;
    }

    public class GameReviewSummary
    {
        public double Average { get; set; }
        public int Count { get; set; }
        public Dictionary<int, int> Distribution { get; set; } = new();
        /// <summary>Сколько отзывов «за» (4–5 звёзд, см. <see cref="Services.ReviewVerdict"/>) — для
        /// «87% recommend» на карточке. Считается только в сводке по одной игре; в массовой (каталог) остаётся 0.</summary>
        public int RecommendCount { get; set; }
    }

    public interface IGameReviewRepository
    {
        Task<(IReadOnlyList<GameReview> Items, long Total)> GetPagedAsync(GameReviewQuery query);
        Task<GameReviewSummary> GetSummaryAsync(string gameId);

        /// <summary>
        /// Оценки сразу по списку игр — для каталога, где карточек десятки.
        /// Одним агрегатом вместо запроса на игру. Игры без отзывов в результате отсутствуют.
        /// </summary>
        Task<IReadOnlyDictionary<string, GameReviewSummary>> GetSummariesAsync(IEnumerable<string> gameIds);

        /// <summary>
        /// Сводка по опубликованным отзывам на ВСЕ игры — витринный «рейтинг магазина».
        /// Считается агрегатом на стороне базы: коллекция растёт без ограничений,
        /// и тянуть её в память ради среднего нельзя.
        /// </summary>
        Task<GameReviewSummary> GetSiteSummaryAsync();

        /// <summary>
        /// Свежие опубликованные отзывы по всем играм — живые цитаты вместо выдуманных.
        /// Отзывы без текста (одна оценка звёздами) не возвращаются: цитировать в них нечего.
        /// </summary>
        Task<IReadOnlyList<GameReview>> GetRecentPublishedAsync(int limit);

        /// <summary>
        /// Свежие опубликованные отзывы с конкретной оценкой. Нужны, чтобы лента на витрине
        /// повторяла распределение оценок, а не была случайной выборкой последних (см.
        /// <see cref="SuperBot.Core.Services.ReviewSample"/>).
        /// </summary>
        Task<IReadOnlyList<GameReview>> GetRecentPublishedByRatingAsync(int rating, int limit);
        Task<GameReview> GetByIdAsync(string reviewId);
        Task<GameReview> GetByUserAsync(string gameId, string userId);

        /// <summary>
        /// На какие из перечисленных игр этот человек уже оставил отзыв.
        ///
        /// Нужно кабинету: в заказе может быть десяток позиций, и спрашивать по одной —
        /// десяток обращений к базе ради одной кнопки. Игры без отзыва в результат не попадают.
        /// </summary>
        Task<IReadOnlySet<string>> GetReviewedGameIdsAsync(string userId, IEnumerable<string> gameIds);
        Task CreateAsync(GameReview review);
        Task UpdateAsync(string reviewId, GameReview review);
        Task UpdateHelpfulCountAsync(string reviewId, int helpfulCount);
        /// <summary>Пометить «Refunded» отзывы покупателя (по UserName заказа) на возвращённые игры. Возвращает, сколько помечено.</summary>
        Task<long> MarkRefundedAsync(string buyerKey, IReadOnlyCollection<string> gameIds);
    }
}
