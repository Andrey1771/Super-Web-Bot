using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameReviewMongoDbRepository : IGameReviewRepository
    {
        private readonly IMongoCollection<GameReviewDb> _reviews;

        /// <summary>Скрытые и ждущие модерации отзывы наружу не отдаём — ни в списках, ни в сводках.</summary>
        private static readonly FilterDefinition<GameReviewDb> PublishedFilter =
            Builders<GameReviewDb>.Filter.Eq(item => item.Status, ReviewStatus.Published.ToString());

        public GameReviewMongoDbRepository(IMongoDatabase database)
        {
            _reviews = database.GetCollection<GameReviewDb>("GameReviews");
        }

        public async Task<(IReadOnlyList<GameReview> Items, long Total)> GetPagedAsync(GameReviewQuery query)
        {
            var filter = BuildFilter(query);
            var total = await _reviews.CountDocumentsAsync(filter);

            var sort = BuildSort(query.Sort);
            var items = await _reviews.Find(filter)
                .Sort(sort)
                .Skip((query.Page - 1) * query.PageSize)
                .Limit(query.PageSize)
                .ToListAsync();

            return (items.Select(MapToEntity).ToList(), total);
        }

        public async Task<GameReviewSummary> GetSummaryAsync(string gameId)
        {
            var filter = Builders<GameReviewDb>.Filter.Eq(item => item.GameId, gameId) & PublishedFilter;

            var items = await _reviews.Find(filter).ToListAsync();
            if (items.Count == 0)
            {
                return new GameReviewSummary();
            }

            var summary = new GameReviewSummary
            {
                Count = items.Count,
                Average = items.Average(item => item.Rating)
            };

            foreach (var group in items.GroupBy(item => item.Rating))
            {
                summary.Distribution[group.Key] = group.Count();
            }

            return summary;
        }

        public async Task<IReadOnlyDictionary<string, GameReviewSummary>> GetSummariesAsync(IEnumerable<string> gameIds)
        {
            var ids = gameIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToArray() ?? Array.Empty<string>();
            if (ids.Length == 0)
            {
                return new Dictionary<string, GameReviewSummary>();
            }

            // Группируем по паре (игра, оценка): наружу приходит не больше пяти строк на игру,
            // сколько бы отзывов на неё ни было.
            var buckets = await _reviews.Aggregate()
                .Match(PublishedFilter & Builders<GameReviewDb>.Filter.In(item => item.GameId, ids))
                .Group(
                    item => new { item.GameId, item.Rating },
                    group => new { group.Key.GameId, group.Key.Rating, Count = group.Count() })
                .ToListAsync();

            return buckets
                .GroupBy(bucket => bucket.GameId)
                .ToDictionary(
                    game => game.Key,
                    game =>
                    {
                        var total = game.Sum(bucket => bucket.Count);
                        return new GameReviewSummary
                        {
                            Count = total,
                            Average = (double)game.Sum(bucket => (long)bucket.Rating * bucket.Count) / total,
                            Distribution = game.ToDictionary(bucket => bucket.Rating, bucket => bucket.Count)
                        };
                    });
        }

        public async Task<GameReviewSummary> GetSiteSummaryAsync()
        {
            // Группировка по оценке идёт в базе: наружу приходит максимум пять строк
            // (по числу возможных оценок), сколько бы отзывов ни накопилось.
            var buckets = await _reviews.Aggregate()
                .Match(PublishedFilter)
                .Group(item => item.Rating, group => new { Rating = group.Key, Count = group.Count() })
                .ToListAsync();

            var total = buckets.Sum(bucket => bucket.Count);
            if (total == 0)
            {
                return new GameReviewSummary();
            }

            return new GameReviewSummary
            {
                Count = total,
                Average = (double)buckets.Sum(bucket => (long)bucket.Rating * bucket.Count) / total,
                Distribution = buckets.ToDictionary(bucket => bucket.Rating, bucket => bucket.Count)
            };
        }

        public async Task<IReadOnlyList<GameReview>> GetRecentPublishedAsync(int limit)
        {
            var withText = PublishedFilter &
                           Builders<GameReviewDb>.Filter.Ne(item => item.Text, null) &
                           Builders<GameReviewDb>.Filter.Ne(item => item.Text, string.Empty);

            var items = await _reviews.Find(withText)
                .Sort(Builders<GameReviewDb>.Sort.Descending(item => item.CreatedAt))
                .Limit(limit)
                .ToListAsync();

            return items.Select(MapToEntity).ToList();
        }

        public async Task<GameReview> GetByIdAsync(string reviewId)
        {
            var review = await _reviews.Find(item => item.Id == reviewId).FirstOrDefaultAsync();
            return MapToEntity(review);
        }

        public async Task<GameReview> GetByUserAsync(string gameId, string userId)
        {
            var review = await _reviews.Find(item => item.GameId == gameId && item.UserId == userId)
                .FirstOrDefaultAsync();
            return MapToEntity(review);
        }

        public async Task CreateAsync(GameReview review)
        {
            var db = MapToDb(review);
            await _reviews.InsertOneAsync(db);
            review.Id = db.Id;
        }

        public async Task UpdateAsync(string reviewId, GameReview review)
        {
            var db = MapToDb(review);
            await _reviews.ReplaceOneAsync(item => item.Id == reviewId, db);
        }

        public async Task UpdateHelpfulCountAsync(string reviewId, int helpfulCount)
        {
            var update = Builders<GameReviewDb>.Update.Set(item => item.HelpfulCount, helpfulCount);
            await _reviews.UpdateOneAsync(item => item.Id == reviewId, update);
        }

        private FilterDefinition<GameReviewDb> BuildFilter(GameReviewQuery query)
        {
            var builder = Builders<GameReviewDb>.Filter;
            var filter = builder.Eq(item => item.GameId, query.GameId) & PublishedFilter;

            if (query.Rating.HasValue)
            {
                filter &= builder.Eq(item => item.Rating, query.Rating.Value);
            }

            if (query.WithPlaytime == true)
            {
                filter &= builder.Ne(item => item.PlaytimeHours, null);
            }

            if (query.WithImages == true)
            {
                filter &= builder.Where(item => item.Images != null && item.Images.Count > 0);
            }

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var regex = new MongoDB.Bson.BsonRegularExpression(query.Search, "i");
                filter &= builder.Regex(item => item.Text, regex);
            }

            return filter;
        }

        private SortDefinition<GameReviewDb> BuildSort(string sort)
        {
            var builder = Builders<GameReviewDb>.Sort;
            if (string.IsNullOrWhiteSpace(sort))
            {
                return builder.Descending(item => item.CreatedAt);
            }

            var parts = sort.Split(':');
            var key = parts[0];
            var direction = parts.Length > 1 ? parts[1] : "desc";

            return key switch
            {
                "rating" => direction == "asc" ? builder.Ascending(item => item.Rating) : builder.Descending(item => item.Rating),
                "helpful" => direction == "asc" ? builder.Ascending(item => item.HelpfulCount) : builder.Descending(item => item.HelpfulCount),
                _ => direction == "asc" ? builder.Ascending(item => item.CreatedAt) : builder.Descending(item => item.CreatedAt)
            };
        }

        private static GameReview MapToEntity(GameReviewDb db)
        {
            if (db == null)
            {
                return null;
            }

            return new GameReview
            {
                Id = db.Id,
                GameId = db.GameId,
                UserId = db.UserId,
                UserName = db.UserName,
                AvatarUrl = db.AvatarUrl,
                VerifiedPurchase = db.VerifiedPurchase,
                Rating = db.Rating,
                PlaytimeHours = db.PlaytimeHours,
                Text = db.Text,
                Images = db.Images?.Select(item => new ReviewImage { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? new List<ReviewImage>(),
                Recommend = db.Recommend,
                CreatedAt = db.CreatedAt,
                UpdatedAt = db.UpdatedAt,
                HelpfulCount = db.HelpfulCount,
                Status = Enum.TryParse<ReviewStatus>(db.Status, out var status) ? status : ReviewStatus.Published,
                ReportCount = db.ReportCount,
                LastReportedAt = db.LastReportedAt,
                ShopReply = db.ShopReply is null ? null : new ReviewReply { Text = db.ShopReply.Text, Author = db.ShopReply.Author, CreatedAt = db.ShopReply.CreatedAt }
            };
        }

        private static GameReviewDb MapToDb(GameReview review)
        {
            return new GameReviewDb
            {
                Id = review.Id,
                GameId = review.GameId,
                UserId = review.UserId,
                UserName = review.UserName,
                AvatarUrl = review.AvatarUrl,
                VerifiedPurchase = review.VerifiedPurchase,
                Rating = review.Rating,
                PlaytimeHours = review.PlaytimeHours,
                Text = review.Text,
                Images = review.Images?.Select(item => new ReviewImageDb { Url = item.Url, ThumbUrl = item.ThumbUrl }).ToList() ?? new List<ReviewImageDb>(),
                Recommend = review.Recommend,
                CreatedAt = review.CreatedAt,
                UpdatedAt = review.UpdatedAt,
                HelpfulCount = review.HelpfulCount,
                Status = review.Status.ToString(),
                ReportCount = review.ReportCount,
                LastReportedAt = review.LastReportedAt,
                ShopReply = review.ShopReply is null ? null : new ReviewReplyDb { Text = review.ShopReply.Text, Author = review.ShopReply.Author, CreatedAt = review.ShopReply.CreatedAt }
            };
        }
    }
}
