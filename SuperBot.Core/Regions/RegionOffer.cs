namespace SuperBot.Core.Regions
{
    /// <summary>
    /// Продаваемый вариант ключа: где активируется и сколько стоит.
    ///
    /// Зачем отдельное понятие. На складе ключи одной игры лежат группами с разной областью
    /// активации: глобальные, европейские, «всё кроме RU/BY». Стоят они у поставщиков по-разному,
    /// и продавать их по одной цене значит либо терять на глобальных, либо переплачивать за
    /// региональные. Покупателю при этом важно ровно две вещи — где ключ заработает и сколько
    /// он стоит; из какой партии он придёт, покупателя не касается.
    ///
    /// Поэтому единица продажи — регион, а партия остаётся внутренним учётом: по ней считается
    /// себестоимость и из неё выдаётся ключ.
    /// </summary>
    public static class RegionOffer
    {
        /// <summary>Ключ варианта «как у игры» — партии без собственной политики.</summary>
        public const string DefaultKey = "default";

        /// <summary>
        /// Устойчивый ключ варианта из политики активации.
        ///
        /// Специально не человекочитаемая подпись: подпись меняют ради красоты, а этот ключ
        /// лежит в позициях корзины и в заказах, и его смена рассыпала бы связь между тем, что
        /// покупатель выбрал, и тем, что ему выдадут. Формат: «global», «global-x:BY,RU»,
        /// «r:EU,NA», «r:EU-x:CN». Списки отсортированы — порядок в настройках роли не играет.
        /// </summary>
        public static string KeyOf(RegionPolicy? policy)
        {
            if (policy is null)
            {
                return DefaultKey;
            }

            var normalized = policy.Normalize();
            var head = normalized.IsGlobal
                ? "global"
                : normalized.Regions.Count > 0
                    ? "r:" + string.Join(",", normalized.Regions.OrderBy(code => code, StringComparer.Ordinal))
                    : "nowhere";

            if (normalized.ExcludedCountries.Count == 0)
            {
                return head;
            }

            var excluded = string.Join(",", normalized.ExcludedCountries.OrderBy(code => code, StringComparer.Ordinal));
            return $"{head}-x:{excluded}";
        }

        /// <summary>
        /// Ключ варианта, каким его видит покупатель: партия без своей политики — это политика игры,
        /// а игра без политики — «везде».
        ///
        /// Из-за этого «партия без политики» и «партия с явной политикой Global» — один и тот же
        /// товар: активируется одинаково и стоит одинаково. Считать их разными вариантами значило
        /// бы показать на витрине два одинаковых «Global» и разрезать склад пополам — покупатель
        /// выбрал бы тот, где лежит один ключ, и ждал бы пополнения при полном складе рядом.
        /// </summary>
        public static string EffectiveKeyOf(RegionPolicy? keyPolicy, RegionPolicy? gamePolicy) =>
            KeyOf(keyPolicy ?? gamePolicy ?? RegionPolicy.Anywhere());

        /// <summary>
        /// Приводит ключ варианта к тому же виду: <see cref="DefaultKey"/> — это политика игры.
        /// Нужно для заказов и цен, сохранённых до нормализации: там ещё лежит «default».
        /// </summary>
        public static string NormalizeKey(string? offerKey, RegionPolicy? gamePolicy)
        {
            var key = string.IsNullOrWhiteSpace(offerKey) ? DefaultKey : offerKey.Trim();
            return string.Equals(key, DefaultKey, StringComparison.OrdinalIgnoreCase)
                ? KeyOf(gamePolicy ?? RegionPolicy.Anywhere())
                : key;
        }

        /// <summary>
        /// Обратный разбор ключа варианта в политику активации.
        ///
        /// Нужен кассе и выдаче: заказ помнит выбранный вариант ключом, а решать «пускать ли
        /// покупателя из этой страны» и «из какой партии брать ключ» надо по политике. Разбирать
        /// ключ, а не искать вариант на складе, важно принципиально: распроданная партия не должна
        /// превращать оплаченный заказ в отказ — заказ, как и раньше, ждёт пополнения склада.
        ///
        /// Возвращает false, если ключ не разбирается (чужой формат — верить ему нельзя).
        /// Для <see cref="DefaultKey"/> возвращает true и policy = null: «политика игры».
        /// </summary>
        public static bool TryParseKey(string? offerKey, out RegionPolicy? policy)
        {
            policy = null;
            if (string.IsNullOrWhiteSpace(offerKey))
            {
                return false;
            }

            var key = offerKey.Trim();
            if (string.Equals(key, DefaultKey, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var head = key;
            var excluded = new List<string>();
            var cut = key.IndexOf("-x:", StringComparison.Ordinal);
            if (cut >= 0)
            {
                head = key[..cut];
                excluded = Split(key[(cut + 3)..]);
                if (excluded.Count == 0 || excluded.Any(code => code.Length != 2))
                {
                    return false;
                }
            }

            if (string.Equals(head, "global", StringComparison.OrdinalIgnoreCase))
            {
                policy = new RegionPolicy { Mode = RegionPolicy.ModeGlobal, ExcludedCountries = excluded };
                return true;
            }

            if (head.StartsWith("r:", StringComparison.OrdinalIgnoreCase))
            {
                var regions = Split(head[2..]);
                if (regions.Count == 0)
                {
                    return false;
                }
                policy = new RegionPolicy { Mode = RegionPolicy.ModeRegions, Regions = regions, ExcludedCountries = excluded };
                return true;
            }

            // «nowhere» и всё незнакомое — не политика: тихо считать это глобальным ключом значит
            // продать покупателю не то, что он выбрал.
            return false;
        }

        private static List<string> Split(string value) => value
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => part.ToUpperInvariant())
            .Distinct()
            .ToList();

        /// <summary>
        /// Название варианта для витрины: «Global», «Europe», «Europe, North America».
        /// Исключения сюда не попадают — они показываются отдельной строкой, иначе название
        /// варианта в списке разъезжается на две строки и перестаёт читаться.
        /// </summary>
        public static string TitleOf(RegionPolicy? policy, RegionCatalog catalog)
        {
            // Политики нет — ключ ничем не ограничен, и называть это «стандартным» значит
            // прятать главное: он работает везде.
            if (policy is null)
            {
                return "Global";
            }

            var normalized = policy.Normalize();
            if (normalized.IsGlobal)
            {
                return "Global";
            }
            if (normalized.Regions.Count == 0)
            {
                return "Region-locked";
            }
            return string.Join(", ", normalized.Regions.Select(catalog.NameOf));
        }
    }

    /// <summary>
    /// Цена варианта, назначенная магазином. Ключ — <see cref="RegionOffer.KeyOf"/>.
    ///
    /// Цены нет — вариант продаётся по цене игры (или издания). Это важное умолчание: пока
    /// магазин не назначил региональные цены, всё работает ровно как раньше.
    /// </summary>
    public class RegionPrice
    {
        /// <summary>Устойчивый ключ варианта, к которому относится цена.</summary>
        public string OfferKey { get; set; } = RegionOffer.DefaultKey;

        /// <summary>Издание, если цена только для него. Пусто — для любого издания игры.</summary>
        public string? EditionCode { get; set; }

        /// <summary>Цена в базовой валюте игры.</summary>
        public decimal Price { get; set; }

        /// <summary>
        /// Ручные цены в других валютах. Как у игры: назначенная человеком цена важнее курса,
        /// а если ни её, ни курса нет — в этой валюте вариант не продаётся.
        /// </summary>
        public Dictionary<string, decimal>? Prices { get; set; }
    }
}
