using System.Text;

namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Жанры игр. Список живёт в настройках (Settings.GameCategories): Tag — постоянный адрес жанра
    /// (/games/category/{tag}), Title — название, порядок массива — порядок в фильтрах. У игры хранится Tag (Game.Genre).
    ///
    /// Раньше жанр был перечислением GameType: двенадцать значений в коде, у игры — номер, а названия дублировались
    /// ещё в двух местах фронта и расходились. Перечисление осталось только для старых документов и старых клиентов
    /// API: из номера выводится код жанра (<see cref="LegacyTag"/>).
    /// </summary>
    public static class GameGenres
    {
        /// <summary>
        /// Жанры по умолчанию — прежние двенадцать. Код — slug прежнего названия: ровно такой адрес
        /// у страниц жанров был и раньше, поэтому ссылки и выдача поисковиков не ломаются.
        /// </summary>
        public static IReadOnlyList<GameCategory> Defaults { get; } = Enum.GetValues<GameType>()
            .Select(type => new GameCategory { Tag = LegacyTag(type), Title = GameTypeMapper.DescriptionsCategories[type] })
            .ToList();

        /// <summary>Код жанра для старого номера GameType: slug его названия («Role-Playing Games (RPGs)» → role-playing-games-rpgs).</summary>
        public static string LegacyTag(GameType type) =>
            Slug(GameTypeMapper.DescriptionsCategories.TryGetValue(type, out var title) ? title : type.ToString());

        /// <summary>Номер GameType для кода жанра по умолчанию; null — жанр заведён в админке, старого номера у него нет.</summary>
        public static GameType? LegacyType(string? tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                return null;
            }
            foreach (var type in Enum.GetValues<GameType>())
            {
                if (string.Equals(LegacyTag(type), tag.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    return type;
                }
            }
            return null;
        }

        /// <summary>Жанр игры: свой код, а у документов до переезда — выведенный из GameType.</summary>
        public static string TagOf(Game game) =>
            string.IsNullOrWhiteSpace(game.Genre) ? LegacyTag(game.GameType) : game.Genre.Trim().ToLowerInvariant();

        /// <summary>Название жанра из списка; нет в списке — из кода («card-games» → «Card games»), чтобы не показывать пустоту.</summary>
        public static string TitleOf(IEnumerable<GameCategory>? genres, string? tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                return string.Empty;
            }
            var found = genres?.FirstOrDefault(genre => string.Equals(genre?.Tag, tag, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(found?.Title))
            {
                return found!.Title;
            }
            var words = tag.Trim().Replace('-', ' ');
            return words.Length == 0 ? string.Empty : char.ToUpperInvariant(words[0]) + words[1..];
        }

        /// <summary>
        /// Slug по тем же правилам, что адреса витрины (SeoController.Slugify, slugify во фронте): буквы, цифры и дефисы,
        /// пробелы — в дефис, знаки — прочь.
        /// </summary>
        public static string Slug(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }
            var slug = new StringBuilder(value.Length);
            foreach (var symbol in value.Trim().ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(symbol))
                {
                    slug.Append(symbol);
                }
                else if ((char.IsWhiteSpace(symbol) || symbol == '-') && slug.Length > 0 && slug[^1] != '-')
                {
                    slug.Append('-');
                }
            }
            return slug.ToString().Trim('-');
        }
    }
}
