namespace SuperBot.Core.Services;

/// <summary>
/// Из каких отзывов собрать ленту на витрине.
///
/// Задача не в том, чтобы показать хорошие отзывы, а в том, чтобы показанная горстка была
/// похожа на всю массу. Просто «десять последних» — это лотерея: неделя неудачных заказов, и
/// посетитель видит стену недовольства при средней оценке 4.1; неделя удачных — и он видит
/// сплошные пятёрки, которых на самом деле 38%. Врут оба случая, просто в разные стороны.
///
/// Поэтому берём столько отзывов каждой оценки, какова её доля в распределении. Ровно то же
/// распределение нарисовано полосками над лентой — и теперь лента ему соответствует.
///
/// Чего здесь СОЗНАТЕЛЬНО нет: отбора по оценке. Прятать двойки и единицы, оставляя среднюю
/// оценку 4.1 на виду, — это витрина, которая противоречит собственным цифрам, и ровно та
/// практика, которую в ЕС и США считают вводящей в заблуждение. Низкие оценки не показываются
/// чаще, чем они есть, но и не реже.
/// </summary>
public static class ReviewSample
{
    /// <summary>
    /// Сколько отзывов каждой оценки взять в ленту длиной <paramref name="total"/>.
    ///
    /// Доли считаются методом наибольшего остатка: сумма квот равна total (или числу всех
    /// отзывов, если их меньше). Оценка, которой в магазине нет, слот не получает.
    /// </summary>
    public static IReadOnlyDictionary<int, int> Quotas(IReadOnlyDictionary<int, int> distribution, int total)
    {
        var result = new Dictionary<int, int>();
        if (total <= 0 || distribution is null)
        {
            return result;
        }

        var counts = new int[5];
        var sum = 0;
        for (var rating = 1; rating <= 5; rating++)
        {
            var value = distribution.TryGetValue(rating, out var found) ? Math.Max(0, found) : 0;
            counts[rating - 1] = value;
            sum += value;
        }

        if (sum == 0)
        {
            return result;
        }

        // Отзывов меньше, чем мест в ленте — берём все, делить нечего.
        var target = Math.Min(total, sum);

        var exact = new double[5];
        var quota = new int[5];
        var assigned = 0;
        for (var i = 0; i < 5; i++)
        {
            exact[i] = counts[i] / (double)sum * target;
            quota[i] = (int)Math.Floor(exact[i]);
            assigned += quota[i];
        }

        // Остаток мест раздаём тем оценкам, у которых отброшенная дробная часть была больше.
        // При равных долях выигрывает более высокая оценка — иначе порядок зависел бы от
        // случайностей сортировки, а так он хотя бы предсказуем.
        var order = Enumerable.Range(0, 5)
            .OrderByDescending(i => exact[i] - Math.Floor(exact[i]))
            .ThenByDescending(i => i)
            .ToList();

        var index = 0;
        while (assigned < target && index < order.Count * 5)
        {
            var i = order[index % order.Count];
            // Больше, чем есть на самом деле, взять нельзя.
            if (quota[i] < counts[i])
            {
                quota[i]++;
                assigned++;
            }
            index++;
        }

        for (var rating = 1; rating <= 5; rating++)
        {
            if (quota[rating - 1] > 0)
            {
                result[rating] = quota[rating - 1];
            }
        }

        return result;
    }

    /// <summary>
    /// Порядок показа: перемешиваем оценки, а не выкладываем «сначала пятёрки, потом двойки».
    ///
    /// Сортировка по убыванию оценки формально ничего не скрывает, но убирает низкие оценки
    /// в хвост ленты, куда долистает меньшинство, — это тот же отбор, только вежливый. Здесь
    /// же берём по одному из каждой оценки по кругу, от высоких к низким: доля сохраняется,
    /// а плохое и хорошее идут вперемешку.
    ///
    /// Порядок детерминированный: одинаковый вход даёт одинаковый выход, и лента не
    /// перетасовывается при каждом обновлении страницы.
    /// </summary>
    public static IReadOnlyList<T> Interleave<T>(IReadOnlyList<T> items, Func<T, int> ratingOf)
    {
        if (items.Count <= 1)
        {
            return items;
        }

        var buckets = items
            .GroupBy(ratingOf)
            .OrderByDescending(group => group.Key)
            .Select(group => new Queue<T>(group))
            .ToList();

        var result = new List<T>(items.Count);
        while (result.Count < items.Count)
        {
            var movedSomething = false;
            foreach (var bucket in buckets)
            {
                if (bucket.Count > 0)
                {
                    result.Add(bucket.Dequeue());
                    movedSomething = true;
                }
            }
            if (!movedSomething)
            {
                break;
            }
        }

        return result;
    }
}
