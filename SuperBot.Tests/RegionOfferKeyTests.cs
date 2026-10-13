using SuperBot.Core.Regions;
using Xunit;

namespace SuperBot.Tests;

/// <summary>
/// Ключ варианта — связь между тем, что покупатель выбрал, и тем, что ему выдадут: он лежит в
/// корзине и в заказе. Поэтому он обязан переживать дорогу туда и обратно без потерь.
/// </summary>
public class RegionOfferKeyTests
{
    public static IEnumerable<object[]> Policies() => new List<object[]>
    {
        new object[] { new RegionPolicy() },
        new object[] { new RegionPolicy { ExcludedCountries = new() { "RU", "BY" } } },
        new object[] { new RegionPolicy { Mode = "Regions", Regions = new() { "EU" } } },
        new object[] { new RegionPolicy { Mode = "Regions", Regions = new() { "EU", "NA" }, ExcludedCountries = new() { "CN" } } }
    };

    [Theory]
    [MemberData(nameof(Policies))]
    public void Key_survives_the_round_trip(RegionPolicy policy)
    {
        var key = RegionOffer.KeyOf(policy);

        Assert.True(RegionOffer.TryParseKey(key, out var parsed));
        Assert.NotNull(parsed);
        Assert.Equal(key, RegionOffer.KeyOf(parsed));
    }

    [Fact]
    public void Order_of_regions_and_exclusions_does_not_change_the_key()
    {
        var one = RegionOffer.KeyOf(new RegionPolicy { Mode = "Regions", Regions = new() { "NA", "EU" }, ExcludedCountries = new() { "RU", "BY" } });
        var other = RegionOffer.KeyOf(new RegionPolicy { Mode = "Regions", Regions = new() { "EU", "NA" }, ExcludedCountries = new() { "BY", "RU" } });

        Assert.Equal(one, other);
    }

    [Fact]
    public void Default_key_means_the_game_policy()
    {
        Assert.True(RegionOffer.TryParseKey("default", out var policy));
        Assert.Null(policy);
    }

    [Fact]
    public void A_batch_without_a_policy_is_the_same_offer_as_an_explicit_global_one()
    {
        // Игра без ограничений: партия «как у игры» и партия с явной политикой Global активируются
        // одинаково и стоят одинаково. Разные ключи означали бы два «Global» на витрине и склад,
        // разрезанный пополам, — покупатель выбрал бы вариант с одним ключом и ждал пополнения.
        var inherited = RegionOffer.EffectiveKeyOf(null, null);
        var explicitGlobal = RegionOffer.EffectiveKeyOf(new RegionPolicy(), null);

        Assert.Equal("global", inherited);
        Assert.Equal(inherited, explicitGlobal);
    }

    [Fact]
    public void A_batch_without_a_policy_follows_the_game_it_belongs_to()
    {
        var europe = new RegionPolicy { Mode = "Regions", Regions = new() { "EU" } };

        // Игра продаётся только в Европе: её «обычная» партия — это европейский вариант,
        // а не «глобальный», иначе покупателю обещали бы активацию, которой не будет.
        Assert.Equal(RegionOffer.KeyOf(europe), RegionOffer.EffectiveKeyOf(null, europe));
        // Старые заказы и цены помнят «default» — он приводится к тому же варианту.
        Assert.Equal(RegionOffer.KeyOf(europe), RegionOffer.NormalizeKey("default", europe));
        // Ключ конкретного варианта нормализация не трогает.
        Assert.Equal("r:NA", RegionOffer.NormalizeKey("r:NA", europe));
    }

    [Theory]
    [InlineData("")]
    [InlineData("r:")]
    [InlineData("nowhere")]
    [InlineData("global-x:")]
    [InlineData("global-x:EUROPE")]
    [InlineData("whatever")]
    public void Unparseable_keys_are_refused_rather_than_guessed(string key)
    {
        // Ключ приходит от клиента. Догадаться «он, наверное, имел в виду глобальный» значит
        // продать не то, что выбрано, — лучше отказать.
        Assert.False(RegionOffer.TryParseKey(key, out var policy));
        Assert.Null(policy);
    }
}
