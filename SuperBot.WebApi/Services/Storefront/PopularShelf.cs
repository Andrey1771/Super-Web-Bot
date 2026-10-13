using SuperBot.WebApi.Controllers;

namespace SuperBot.WebApi.Services.Storefront;

/// <summary>
/// Полка «Popular this week» всегда полная.
///
/// Сначала настоящие продажи: за неделю, потом за месяц (порядок чарта). Если продаж на полку не хватает — молодой
/// магазин, тихая неделя — остаток добирается играми в наличии с лучшим рейтингом и отзывами. Добор ротируется по
/// дате: главная выглядит живой, но не прыгает при каждом обновлении и не показывает случайный мусор.
/// <see cref="SoldThisWeek"/> говорит витрине, сколько на полке настоящих недельных продаж — от этого зависит подпись.
/// </summary>
public sealed record PopularShelfResult(IReadOnlyList<CatalogItem> Items, int SoldThisWeek);

public static class PopularShelf
{
    public static PopularShelfResult Build(
        IReadOnlyList<GameController.WeeklyChartEntry> chart,
        IReadOnlyList<CatalogItem> released,
        int capacity,
        DateTime today)
    {
        var byId = released
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .GroupBy(item => item.Id!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        var picked = new List<CatalogItem>();
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var soldThisWeek = 0;
        foreach (var entry in chart)
        {
            if (entry.GameId is null || !byId.TryGetValue(entry.GameId, out var item) || !taken.Add(entry.GameId))
            {
                continue;
            }
            if (entry.Sold > 0)
            {
                soldThisWeek++;
            }
            picked.Add(item);
            if (picked.Count >= capacity)
            {
                return new PopularShelfResult(picked, soldThisWeek);
            }
        }

        // Добор: в наличии, с рейтингом и отзывами, стабильный порядок; окно сдвигается раз в день.
        var fill = released
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !taken.Contains(item.Id!))
            .OrderByDescending(item => item.InStock)
            .ThenByDescending(item => item.Rating ?? 0)
            .ThenByDescending(item => item.ReviewCount)
            .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (fill.Count > 0)
        {
            var offset = today.DayOfYear % fill.Count;
            fill = fill.Skip(offset).Concat(fill.Take(offset)).ToList();
        }
        foreach (var item in fill)
        {
            if (picked.Count >= capacity)
            {
                break;
            }
            taken.Add(item.Id!);
            picked.Add(item);
        }
        return new PopularShelfResult(picked, soldThisWeek);
    }
}
