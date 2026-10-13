using SuperBot.Core.Regions;

namespace SuperBot.WebApi.Services.Regions;

/// <summary>
/// Подпись региона для витрины: где ключ активируется и подходит ли он этому покупателю.
///
/// Собрано в одном месте намеренно. Одна и та же игра показывается в каталоге, в корзине и на
/// своей странице; если каждое место сочиняет формулировку само, покупатель видит «Activates in
/// Europe» в одном месте и «Region-locked» в другом — и перестаёт верить обоим.
///
/// Поле <see cref="Allowed"/> равно null, когда страна покупателя неизвестна: это не «подходит»
/// и не «не подходит», а «не знаем». Витрина в этом случае показывает регион без вердикта,
/// вместо того чтобы пугать запретом на пустом месте.
/// </summary>
public sealed record RegionSummary(
    string Mode,
    IReadOnlyList<string> Regions,
    IReadOnlyList<string> RegionNames,
    IReadOnlyList<string> ExcludedCountries,
    string? BuyerCountry,
    bool? Allowed,
    string Summary,
    string? Exclusions,
    /// <summary>Короткая подпись для бейджа: «Global», «Europe», «Europe +1». Помещается в карточку.</summary>
    string Badge,
    /// <summary>
    /// Вид подписи кодом — по нему витрина собирает текст на языке покупателя из
    /// <see cref="RegionNames"/> и <see cref="ExcludedCountries"/>. Английские Summary/Badge
    /// остаются как запас для старых клиентов и админки.
    /// </summary>
    string Kind)
{
    public const string KindWorldwide = "worldwide";
    public const string KindRegions = "regions";
    public const string KindLocked = "locked";
    /// <summary>Партии с разной областью активации, страна покупателя неизвестна.</summary>
    public const string KindVaries = "varies";

    public static RegionSummary Build(RegionPolicy? policy, RegionCatalog catalog, string? buyerCountry)
    {
        var normalized = (policy ?? RegionPolicy.Anywhere()).Normalize();
        var regionNames = normalized.IsGlobal
            ? Array.Empty<string>()
            : normalized.Regions.Select(catalog.NameOf).ToArray();

        var badge = normalized.IsGlobal
            ? "Global"
            : regionNames.Length switch
            {
                0 => "Region-locked",
                1 => regionNames[0],
                // Перечислять все регионы в бейдже нельзя — он перестанет помещаться в карточку.
                // Полный список покупатель видит в подписи рядом и на странице игры.
                _ => $"{regionNames[0]} +{regionNames.Length - 1}"
            };

        return new RegionSummary(
            Mode: normalized.Mode,
            Regions: normalized.Regions,
            RegionNames: regionNames,
            ExcludedCountries: normalized.ExcludedCountries,
            BuyerCountry: buyerCountry,
            Allowed: string.IsNullOrWhiteSpace(buyerCountry) ? null : normalized.Allows(buyerCountry, catalog),
            Summary: normalized.IsGlobal
                ? "Activates worldwide"
                : regionNames.Length > 0 ? $"Activates in {string.Join(", ", regionNames)}" : "Region-locked",
            Exclusions: normalized.ExcludedCountries.Count > 0
                ? $"Not in {string.Join(", ", normalized.ExcludedCountries)}"
                : null,
            Badge: badge,
            Kind: normalized.IsGlobal ? KindWorldwide : regionNames.Length > 0 ? KindRegions : KindLocked);
    }

    /// <summary>
    /// Подпись региона по тому, что реально лежит на складе.
    ///
    /// Область активации — свойство партии ключей, а не игры: магазин может залить ключи
    /// «везде кроме RU», не трогая политику самой игры. Выдача смотрит на политику партии
    /// (см. TryDispensePoolKeyAsync), и витрина обязана судить по ней же — иначе карточка
    /// обещает «активируется везде» ровно там, где ключ не активируется.
    ///
    /// Правило простое и совпадает с выдачей: покупателю подходит игра, если подходит хотя бы
    /// один доступный ключ. Ключей нет — говорим по политике игры: это единственное, что магазин
    /// про товар объявил.
    /// </summary>
    public static RegionSummary BuildForKeys(
        IReadOnlyList<RegionPolicy?>? keyPolicies,
        RegionPolicy? gamePolicy,
        RegionCatalog catalog,
        string? buyerCountry)
    {
        // Партия без своей политики живёт по политике игры — как и при выдаче.
        var effective = (keyPolicies ?? Array.Empty<RegionPolicy?>())
            .Select(policy => policy ?? gamePolicy ?? RegionPolicy.Anywhere())
            .GroupBy(policy => RegionOffer.KeyOf(policy))
            .Select(group => group.First())
            .ToList();

        if (effective.Count == 0)
        {
            return Build(gamePolicy, catalog, buyerCountry);
        }

        if (effective.Count == 1)
        {
            return Build(effective[0], catalog, buyerCountry);
        }

        // Партии с разной областью активации. Что получит покупатель — зависит от того, какой
        // ключ ему подойдёт, поэтому описываем именно его; общей формулировки тут не существует.
        if (!string.IsNullOrWhiteSpace(buyerCountry))
        {
            var mine = effective.FirstOrDefault(policy => policy.Allows(buyerCountry, catalog));
            if (mine is not null)
            {
                return Build(mine, catalog, buyerCountry);
            }

            // Не подходит ни один — берём первую партию, чтобы объяснить причину, но вердикт
            // остаётся общим по складу.
            return Build(effective[0], catalog, buyerCountry) with { Allowed = false };
        }

        // Страна неизвестна: не выбираем за покупателя, а честно говорим, что вариантов несколько.
        return Build(effective[0], catalog, null) with
        {
            Summary = "Activation region depends on the key",
            Badge = "Varies by key",
            Kind = KindVaries
        };
    }

    /// <summary>Есть ли что показывать покупателю: у товара без ограничений бейдж только шумит.</summary>
    public bool IsRestricted => !string.Equals(Mode, RegionPolicy.ModeGlobal, StringComparison.OrdinalIgnoreCase)
        || ExcludedCountries.Count > 0;
}
