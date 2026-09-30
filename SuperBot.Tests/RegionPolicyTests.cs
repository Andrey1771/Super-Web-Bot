using SuperBot.Core.Regions;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>Политика активации: Global с исключениями, набор регионов, неизвестная страна.</summary>
    public class RegionPolicyTests
    {
        private static readonly RegionCatalog Catalog = new();

        [Fact]
        public void Global_allows_everywhere_except_excluded_countries()
        {
            var policy = new RegionPolicy { Mode = "Global", ExcludedCountries = new() { "ru", "CN" } }.Normalize();
            Assert.True(policy.Allows("US", Catalog));
            Assert.True(policy.Allows("de", Catalog));
            Assert.False(policy.Allows("RU", Catalog));
            Assert.False(policy.Allows("cn", Catalog));
            Assert.True(policy.Blocks("RU", Catalog));
        }

        [Fact]
        public void Regions_mode_allows_only_listed_regions_minus_exclusions()
        {
            var policy = new RegionPolicy { Mode = "Regions", Regions = new() { "EU", "NA" }, ExcludedCountries = new() { "UA" } }.Normalize();
            Assert.True(policy.Allows("DE", Catalog));
            Assert.True(policy.Allows("US", Catalog));
            Assert.False(policy.Allows("JP", Catalog));
            // Исключение сильнее региона: Украина входит в EU-набор, но вычеркнута.
            Assert.False(policy.Allows("UA", Catalog));
        }

        [Fact]
        public void Unknown_country_is_not_blocked()
        {
            var policy = new RegionPolicy { Mode = "Regions", Regions = new() { "EU" } };
            Assert.True(policy.Allows(null, Catalog));
            Assert.True(policy.Allows("", Catalog));
            Assert.False(policy.Blocks(null, Catalog));
        }

        [Fact]
        public void Anywhere_is_global_without_exclusions()
        {
            var policy = RegionPolicy.Anywhere();
            Assert.True(policy.IsGlobal);
            Assert.True(policy.Allows("KP", Catalog));
        }
    }
}
