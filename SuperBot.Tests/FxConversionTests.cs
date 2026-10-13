using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Пересчёт по курсу и округление. Здесь фиксируется главное денежное правило Этапа 4:
    /// округляем **только вверх**. Округление вниз означает продавать дешевле назначенного —
    /// потеря видна не в тесте, а в отчёте за квартал.
    /// </summary>
    public class FxConversionTests
    {
        private static FxRate Rate(decimal value) => new("USD", "EUR", value, DateTime.UtcNow);

        // ---------- округление ----------

        [Theory]
        [InlineData(54.00, 54.99)]
        [InlineData(54.37, 54.99)]
        [InlineData(54.99, 54.99)]  // уже ценник — не трогаем
        [InlineData(55.01, 55.99)]
        public void NinetyNine_alwaysLandsOnAPriceTag(decimal amount, decimal expected)
        {
            Assert.Equal(expected, PriceRounding.Apply(amount, PriceRoundingRule.NinetyNine, "EUR"));
        }

        [Theory]
        [InlineData(6432, 6440)]
        [InlineData(6440, 6440)]
        [InlineData(6441, 6450)]
        public void Ten_roundsUpToTheNextTen(decimal amount, decimal expected)
        {
            Assert.Equal(expected, PriceRounding.Apply(amount, PriceRoundingRule.Ten, "JPY"));
        }

        [Theory]
        [InlineData(6432, 6500)]
        [InlineData(6500, 6500)]
        [InlineData(6501, 6600)]
        public void Hundred_roundsUpToTheNextHundred(decimal amount, decimal expected)
        {
            Assert.Equal(expected, PriceRounding.Apply(amount, PriceRoundingRule.Hundred, "JPY"));
        }

        [Fact]
        public void None_roundsUpToCurrencyPrecisionNotToNearest()
        {
            // 54.371 → 54.38, а не 54.37: к ближайшему округлять нельзя, это цена ниже назначенной.
            Assert.Equal(54.38m, PriceRounding.Apply(54.371m, PriceRoundingRule.None, "EUR"));
            // У валюты без копеек последний разряд — единица.
            Assert.Equal(6433m, PriceRounding.Apply(6432.1m, PriceRoundingRule.None, "JPY"));
        }

        [Fact]
        public void Rounding_neverGoesDown()
        {
            foreach (var rule in new[] { PriceRoundingRule.NinetyNine, PriceRoundingRule.Ten, PriceRoundingRule.Hundred, PriceRoundingRule.None })
            {
                Assert.True(PriceRounding.Apply(54.37m, rule, "EUR") >= 54.37m, $"правило {rule} уронило цену");
            }
        }

        // ---------- пересчёт ----------

        [Fact]
        public void Convert_appliesRateThenMarkupThenRounding()
        {
            // 59.99 × 0.90 = 53.99, +3 % = 55.61, вверх до ценника = 55.99.
            var result = FxConversion.Convert(59.99m, Rate(0.90m), markupPercent: 3m, PriceRoundingRule.NinetyNine, "EUR");

            Assert.Equal(55.99m, result);
        }

        [Fact]
        public void Convert_markupIsAppliedBeforeRounding()
        {
            // Если бы наценку накладывали после округления, получилось бы 54.99 × 1.03 = 56.64 —
            // и «красивый» ценник превратился бы обратно в случайное число.
            var result = FxConversion.Convert(60m, Rate(0.90m), markupPercent: 3m, PriceRoundingRule.NinetyNine, "EUR");

            Assert.Equal(55.99m, result);
        }

        [Fact]
        public void Convert_withoutRate_returnsNull()
        {
            // Курса нет — пересчитать нечем. Это отказ, а не «взять как есть».
            Assert.Null(FxConversion.Convert(59.99m, null, 3m, PriceRoundingRule.NinetyNine, "EUR"));
        }

        [Fact]
        public void Convert_withBrokenRate_returnsNull()
        {
            Assert.Null(FxConversion.Convert(59.99m, Rate(0m), 3m, PriceRoundingRule.NinetyNine, "EUR"));
            Assert.Null(FxConversion.Convert(59.99m, Rate(-1m), 3m, PriceRoundingRule.NinetyNine, "EUR"));
        }

        [Fact]
        public void Convert_freeStaysFree()
        {
            // Округление вверх сделало бы бесплатную игру платной.
            Assert.Equal(0m, FxConversion.Convert(0m, Rate(0.9m), 3m, PriceRoundingRule.NinetyNine, "EUR"));
        }

        [Fact]
        public void Convert_zeroMarkupIsAllowed()
        {
            // 59.99 × 0.90 = 53.991. Ближайший ценник снизу — 53.99, но это меньше пересчитанной
            // суммы, то есть продажа дешевле назначенного. Поэтому 54.99: округляем только вверх.
            Assert.Equal(54.99m, FxConversion.Convert(59.99m, Rate(0.90m), markupPercent: 0m, PriceRoundingRule.NinetyNine, "EUR"));
        }

        // ---------- гард на скачок курса ----------

        [Theory]
        [InlineData(1.0, 1.1, 10)]
        [InlineData(1.0, 0.9, 10)]
        [InlineData(0.9, 0.9, 0)]
        public void ChangePercent_measuresJumpInBothDirections(decimal previous, decimal next, decimal expected)
        {
            Assert.Equal(expected, Math.Round(FxConversion.ChangePercent(previous, next), 4));
        }

        [Fact]
        public void ChangePercent_withoutPreviousRate_isZero()
        {
            // Первого курса не с чем сравнивать — гард не должен блокировать самый первый импорт.
            Assert.Equal(0m, FxConversion.ChangePercent(0m, 1.2m));
        }
    }
}
