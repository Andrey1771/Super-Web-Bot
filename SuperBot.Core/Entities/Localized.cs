namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Переводы текстового поля: язык сайта (ru/uk/pl) → текст. Основное поле остаётся английским и
    /// показывается, когда перевода нет. Один приём на все сущности, как <see cref="GameCategory.Titles"/>.
    /// </summary>
    public static class Localized
    {
        public static readonly string[] Languages = { "ru", "uk", "pl" };

        /// <summary>Текст на языке покупателя; нет перевода — основное значение.</summary>
        public static string? Pick(Dictionary<string, string>? i18n, string? locale, string? fallback) =>
            locale is not null && i18n is not null && i18n.TryGetValue(locale, out var text) && !string.IsNullOrWhiteSpace(text)
                ? text
                : fallback;

        /// <summary>Список на языке покупателя (пункты, особенности); нет перевода — основной список.</summary>
        public static List<string> PickList(Dictionary<string, List<string>>? i18n, string? locale, List<string> fallback) =>
            locale is not null && i18n is not null && i18n.TryGetValue(locale, out var list) && list is { Count: > 0 }
                ? list
                : fallback;

        /// <summary>
        /// Переводы к сохранению: только языки сайта кроме английского, без пустых строк. Пусто — null,
        /// чтобы в документе не копились пустые словари.
        /// </summary>
        public static Dictionary<string, string>? Normalize(Dictionary<string, string>? i18n)
        {
            if (i18n is null)
            {
                return null;
            }
            var result = new Dictionary<string, string>();
            foreach (var (locale, text) in i18n)
            {
                var code = (locale ?? string.Empty).Trim().ToLowerInvariant();
                if (Array.IndexOf(Languages, code) < 0 || string.IsNullOrWhiteSpace(text))
                {
                    continue;
                }
                result[code] = text.Trim();
            }
            return result.Count > 0 ? result : null;
        }

        /// <summary>
        /// Подписи списка по позициям: перевод на языке, если он есть, иначе английское значение той же позиции.
        /// Длина всегда равна длине основного списка.
        /// </summary>
        public static List<string> PickAligned(Dictionary<string, List<string>>? i18n, string? locale, IReadOnlyList<string> values)
        {
            var translated = locale is not null && i18n is not null && i18n.TryGetValue(locale, out var list) ? list : null;
            var result = new List<string>(values.Count);
            for (var i = 0; i < values.Count; i++)
            {
                var text = translated is not null && i < translated.Count ? translated[i] : null;
                result.Add(string.IsNullOrWhiteSpace(text) ? values[i] : text!.Trim());
            }
            return result;
        }

        /// <summary>
        /// Переводы по позициям к сохранению: списки подгоняются под длину основного (лишнее отбрасывается,
        /// недостающее — пустые строки), языки без единого перевода и чужие языки убираются.
        /// </summary>
        public static Dictionary<string, List<string>>? NormalizeAligned(Dictionary<string, List<string>>? i18n, int count)
        {
            if (i18n is null || count == 0)
            {
                return null;
            }
            var result = new Dictionary<string, List<string>>();
            foreach (var (locale, list) in i18n)
            {
                var code = (locale ?? string.Empty).Trim().ToLowerInvariant();
                if (Array.IndexOf(Languages, code) < 0)
                {
                    continue;
                }
                var aligned = Enumerable.Range(0, count)
                    .Select(i => list is not null && i < list.Count ? (list[i] ?? string.Empty).Trim() : string.Empty)
                    .ToList();
                if (aligned.Any(item => item.Length > 0))
                {
                    result[code] = aligned;
                }
            }
            return result.Count > 0 ? result : null;
        }

        public static Dictionary<string, List<string>>? NormalizeList(Dictionary<string, List<string>>? i18n)
        {
            if (i18n is null)
            {
                return null;
            }
            var result = new Dictionary<string, List<string>>();
            foreach (var (locale, list) in i18n)
            {
                var code = (locale ?? string.Empty).Trim().ToLowerInvariant();
                var items = (list ?? new List<string>()).Select(item => (item ?? string.Empty).Trim()).Where(item => item.Length > 0).ToList();
                if (Array.IndexOf(Languages, code) < 0 || items.Count == 0)
                {
                    continue;
                }
                result[code] = items;
            }
            return result.Count > 0 ? result : null;
        }
    }
}
