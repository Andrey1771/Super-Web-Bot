using SuperBot.Core.Payments;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Разбор ответа сервиса курсов — самое хрупкое место интеграции. Проверяем строкой,
    /// а не походом в сеть: чужой сервис умеет отвечать заглушкой, страницей ошибки и
    /// обрезанным телом, и ни один из этих случаев не должен ронять магазин.
    /// </summary>
    public class FxRatesPayloadTests
    {
        private static readonly DateTime At = new(2026, 8, 17, 0, 0, 0, DateTimeKind.Utc);
        private static readonly string[] Wanted = { "EUR", "JPY" };

        private static IReadOnlyList<FxRate> Parse(string json) =>
            FxRatesPayload.Parse(json, "USD", Wanted, At);

        [Fact]
        public void TakesOnlyRequestedCurrencies()
        {
            // Провайдер отдаёт полторы сотни валют — в историю должны попасть только наши.
            var rates = Parse("""{"base":"USD","rates":{"EUR":0.92,"JPY":150.5,"PLN":4.1,"UAH":41}}""");

            Assert.Equal(2, rates.Count);
            Assert.Contains(rates, rate => rate.To == "EUR" && rate.Rate == 0.92m);
            Assert.Contains(rates, rate => rate.To == "JPY" && rate.Rate == 150.5m);
        }

        [Fact]
        public void SkipsBaseCurrency()
        {
            // Курс валюты к самой себе — единица, хранить его незачем.
            var rates = FxRatesPayload.Parse("""{"rates":{"USD":1,"EUR":0.92}}""", "USD", new[] { "USD", "EUR" }, At);

            Assert.Equal("EUR", Assert.Single(rates).To);
        }

        [Fact]
        public void MissingCurrency_isSkippedNotFailed()
        {
            // Провайдер не знает йену — берём то, что есть, вместо отказа целиком.
            var rates = Parse("""{"rates":{"EUR":0.92}}""");

            Assert.Equal("EUR", Assert.Single(rates).To);
        }

        [Theory]
        [InlineData("""{"rates":{"EUR":0}}""")]
        [InlineData("""{"rates":{"EUR":-1}}""")]
        [InlineData("""{"rates":{"EUR":"0.92"}}""")]
        [InlineData("""{"rates":{"EUR":null}}""")]
        public void BrokenValues_areDropped(string json)
        {
            // До гарда такие значения доходить не должны: он сравнивает с прежним курсом,
            // а ноль и строка — это не «курс уехал», это сломанный ответ.
            Assert.Empty(FxRatesPayload.Parse(json, "USD", new[] { "EUR" }, At));
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("<html>502 Bad Gateway</html>")]
        [InlineData("""{"error":"quota exceeded"}""")]
        [InlineData("""{"rates":"nope"}""")]
        public void GarbageResponse_yieldsNothingAndDoesNotThrow(string json)
        {
            // Прежние курсы остаются в силе — магазин продолжает торговать.
            Assert.Empty(FxRatesPayload.Parse(json, "USD", Wanted, At));
        }

        [Fact]
        public void RatesPropertyIsConfigurable()
        {
            // У другого провайдера карта курсов лежит под своим ключом — меняется настройкой,
            // а не правкой прайсинга.
            var rates = FxRatesPayload.Parse("""{"conversion_rates":{"EUR":0.92}}""", "USD", Wanted, At, "conversion_rates");

            Assert.Equal(0.92m, Assert.Single(rates).Rate);
        }

        [Fact]
        public void CaptureTimeComesFromTheCaller()
        {
            // Время снимка задаёт вызывающий: время провайдера и наше могут расходиться,
            // а история должна быть в одной шкале с заказами.
            Assert.Equal(At, Parse("""{"rates":{"EUR":0.92}}""").Single().CapturedAtUtc);
        }
    }
}
