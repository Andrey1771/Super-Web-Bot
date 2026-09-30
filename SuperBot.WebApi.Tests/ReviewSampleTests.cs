using SuperBot.Core.Services;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Из чего складывается лента отзывов на витрине.
///
/// Проверяем ровно две вещи: показанная горстка похожа на всю массу, и низкие оценки из неё
/// не вычищаются. Первое — чтобы посетителю не досталась случайная стена недовольства при
/// хорошей средней; второе — чтобы витрина не противоречила собственным цифрам.
/// </summary>
public class ReviewSampleTests
{
    private static Dictionary<int, int> Dist(int five, int four, int three, int two, int one) =>
        new() { [5] = five, [4] = four, [3] = three, [2] = two, [1] = one };

    [Fact]
    public void Sample_mirrors_the_real_distribution()
    {
        // Настоящее распределение магазина на момент правки: 23/26/10/2/0 из 61.
        var quotas = ReviewSample.Quotas(Dist(23, 26, 10, 2, 0), 10);

        Assert.Equal(10, quotas.Values.Sum());
        Assert.Equal(4, quotas[5]);  // 37.7% → 4 из 10
        Assert.Equal(4, quotas[4]);  // 42.6% → 4
        Assert.Equal(2, quotas[3]);  // 16.4% → 2
        Assert.False(quotas.ContainsKey(1));
    }

    [Fact]
    public void A_bad_week_does_not_become_a_wall_of_complaints()
    {
        // Даже если последние отзывы сплошь плохие, доли считаются по всей массе.
        var quotas = ReviewSample.Quotas(Dist(60, 30, 5, 3, 2), 10);

        Assert.Equal(6, quotas[5]);
        Assert.Equal(3, quotas[4]);
        Assert.True(quotas.GetValueOrDefault(2) + quotas.GetValueOrDefault(1) <= 1);
    }

    [Fact]
    public void Low_ratings_are_not_filtered_out_when_there_are_many_of_them()
    {
        // Обратная проверка: если магазин действительно плох, лента это покажет.
        var quotas = ReviewSample.Quotas(Dist(1, 1, 2, 3, 3), 10);

        Assert.Equal(3, quotas[2]);
        Assert.Equal(3, quotas[1]);
        Assert.Equal(10, quotas.Values.Sum());
    }

    [Fact]
    public void Quotas_never_exceed_what_exists()
    {
        var quotas = ReviewSample.Quotas(Dist(2, 1, 0, 0, 0), 10);

        Assert.Equal(2, quotas[5]);
        Assert.Equal(1, quotas[4]);
        Assert.Equal(3, quotas.Values.Sum()); // всего отзывов три — больше взять неоткуда
    }

    [Fact]
    public void No_reviews_no_quotas()
    {
        Assert.Empty(ReviewSample.Quotas(Dist(0, 0, 0, 0, 0), 10));
        Assert.Empty(ReviewSample.Quotas(Dist(5, 5, 0, 0, 0), 0));
    }

    [Fact]
    public void Interleave_mixes_ratings_instead_of_burying_the_bad_ones_at_the_end()
    {
        var items = new[] { 5, 5, 5, 4, 4, 2 };

        var order = ReviewSample.Interleave(items, value => value).ToArray();

        // Двойка не уезжает в хвост ленты, куда долистает меньшинство.
        Assert.Equal(2, order[2]);
        Assert.Equal(new[] { 5, 4, 2, 5, 4, 5 }, order);
    }

    [Fact]
    public void Interleave_keeps_every_item_and_is_stable()
    {
        var items = new[] { 5, 4, 3, 5, 1 };

        var first = ReviewSample.Interleave(items, value => value);
        var second = ReviewSample.Interleave(items, value => value);

        Assert.Equal(items.OrderBy(v => v), first.OrderBy(v => v));
        Assert.Equal(first, second); // порядок не пляшет от обновления к обновлению
    }
}
