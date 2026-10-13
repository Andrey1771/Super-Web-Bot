using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Core.Catalog
{
    /// <summary>
    /// Ролик для превью при наведении на карточку товара: помеченный как трейлер, иначе первое видео галереи.
    /// Одно правило на каталог, рекомендации и страницу товара — чтобы одна и та же игра везде показывала один ролик.
    /// </summary>
    public static class CatalogTrailer
    {
        public static (string? Url, string? Poster) Pick(GameDetails? details)
        {
            var media = details?.Gallery?
                .Where(item => !string.IsNullOrWhiteSpace(item.Url)
                    && (item.IsTrailer || string.Equals(item.Type, "video", StringComparison.OrdinalIgnoreCase)))
                .OrderByDescending(item => item.IsTrailer)
                .ThenBy(item => item.Order)
                .FirstOrDefault();
            return media is null ? (null, null) : (media.Url, media.PosterUrl ?? media.ThumbUrl);
        }

        /// <summary>Трейлеры для набора игр по их id — одним запросом к карточкам.</summary>
        public static async Task<IReadOnlyDictionary<string, (string? Url, string? Poster)>> ForGamesAsync(
            IGameDetailsRepository details, IEnumerable<string?> gameIds)
        {
            var ids = gameIds.Where(id => !string.IsNullOrWhiteSpace(id)).Select(id => id!).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var result = new Dictionary<string, (string? Url, string? Poster)>(StringComparer.OrdinalIgnoreCase);
            if (ids.Count == 0)
            {
                return result;
            }
            var all = await details.GetByGameIdsAsync(ids);
            foreach (var item in all ?? new List<GameDetails>())
            {
                if (string.IsNullOrWhiteSpace(item.GameId))
                {
                    continue;
                }
                var trailer = Pick(item);
                if (trailer.Url != null)
                {
                    result[item.GameId] = trailer;
                }
            }
            return result;
        }
    }
}
