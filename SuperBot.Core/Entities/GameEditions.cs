namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Правило «издание по умолчанию» — одно на весь магазин. Раньше оно было переписано в пяти местах
    /// (каталог, страница товара, кабинет, письмо, проверка карточки) и копии расходились: одни отбрасывали
    /// издания без кода, другие брали первое как есть, — и один и тот же ключ подписывался по-разному.
    /// </summary>
    public static class GameEditions
    {
        /// <summary>Продаваемые издания: у издания без кода нет ни цены на витрине, ни ключей на складе.</summary>
        public static IReadOnlyList<GameEdition> Sellable(IEnumerable<GameEdition>? editions) =>
            (editions ?? Enumerable.Empty<GameEdition>()).Where(edition => !string.IsNullOrWhiteSpace(edition?.Code)).ToList();

        /// <summary>Издание по умолчанию: помеченное IsDefault, иначе первое продаваемое. null — изданий нет.</summary>
        public static GameEdition? DefaultOf(IEnumerable<GameEdition>? editions)
        {
            var sellable = Sellable(editions);
            return sellable.FirstOrDefault(edition => edition.IsDefault) ?? sellable.FirstOrDefault();
        }

        /// <summary>Издание по коду (без учёта регистра); пустой код — издание по умолчанию.</summary>
        public static GameEdition? Resolve(IEnumerable<GameEdition>? editions, string? code) =>
            string.IsNullOrWhiteSpace(code)
                ? DefaultOf(editions)
                : Sellable(editions).FirstOrDefault(edition => string.Equals(edition.Code, code.Trim(), StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// Свободные ключи издания: свои плюс, у издания по умолчанию, ключи без кода издания — так заливался
        /// весь склад до появления изданий. Одно правило для каталога, страницы товара и проверки карточки.
        /// </summary>
        public static int AvailableFor(IReadOnlyDictionary<string, int>? availableByEdition, GameEdition edition, bool isDefault)
        {
            if (availableByEdition is null || string.IsNullOrWhiteSpace(edition.Code))
            {
                return 0;
            }
            availableByEdition.TryGetValue(edition.Code, out var own);
            var untagged = 0;
            if (isDefault)
            {
                availableByEdition.TryGetValue(string.Empty, out untagged);
            }
            return own + untagged;
        }

        /// <summary>Является ли издание изданием по умолчанию среди своих соседей.</summary>
        public static bool IsDefaultIn(IEnumerable<GameEdition>? editions, GameEdition? edition) =>
            edition is not null && DefaultOf(editions) is { } fallback
            && string.Equals(fallback.Code, edition.Code, StringComparison.OrdinalIgnoreCase);
    }
}
