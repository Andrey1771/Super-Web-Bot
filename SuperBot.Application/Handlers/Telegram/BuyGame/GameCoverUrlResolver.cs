using System.Text.RegularExpressions;

namespace SuperBot.Application.Handlers.Telegram.BuyGame
{
    /// <summary>
    /// Резолв обложки игры для Telegram — тот же принцип, что на сайте (см. utils/game-cover.ts):
    /// абсолютный URL берём как есть, относительный путь достраиваем базовым адресом,
    /// пустой/мусорный ("string") путь → null (вызывающий подставит дефолтную обложку).
    /// </summary>
    public static class GameCoverUrlResolver
    {
        private static readonly Regex AbsoluteUrl = new(@"^(?:[a-z]+:)?//", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex WwwRootPrefix = new(@"^/?wwwroot/", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static string? ResolveCoverUrl(string? imagePath, string? baseUrl)
        {
            var value = imagePath?.Trim();
            if (string.IsNullOrEmpty(value) || value.Equals("string", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var path = WwwRootPrefix.Replace(value, "/");

            if (AbsoluteUrl.IsMatch(path)
                || path.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
                || path.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
            {
                return path;
            }

            var trimmedBase = baseUrl?.Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(trimmedBase))
            {
                return path;
            }

            var urlPath = path.StartsWith('/') ? path : "/" + path;
            return trimmedBase + urlPath;
        }

        /// <summary>Telegram грузит фото только по абсолютному http(s)-URL; всё остальное — повод для дефолта.</summary>
        public static bool IsUsablePhotoUrl(string? url) =>
            Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}
