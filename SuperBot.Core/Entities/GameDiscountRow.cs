namespace SuperBot.Core.Entities;

/// <summary>
/// Строка админского списка скидок: игра вместе со своей скидкой.
///
/// Отдельный тип, а не пара «игра + скидка», потому что список сортируется по колонкам,
/// которых нет ни в той, ни в другой сущности по отдельности — итоговая цена и статус
/// считаются на стыке двух коллекций. Считать их в браузере значило бы сортировать
/// загруженное окно, а это враньё: за окном остаётся весь остальной каталог.
/// </summary>
public sealed class GameDiscountRow
{
    public string GameId { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? ImagePath { get; set; }
    public decimal BasePrice { get; set; }

    /// <summary>Процент скидки; null — скидки нет.</summary>
    public decimal? DiscountPercent { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    /// <summary>active | scheduled | expired | no_discount — посчитан базой на момент запроса.</summary>
    public string Status { get; set; } = "no_discount";
}
