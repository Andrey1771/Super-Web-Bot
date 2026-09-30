using SuperBot.Core.Services;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Разбор состояния вебхука. Опроса (getUpdates) в проекте нет, поэтому мёртвый адрес —
    /// это полностью неработающий бот, который при этом ничем себя не выдаёт: контейнер жив,
    /// лог чист. Здесь проверяется, что каждое такое состояние названо своим именем и что
    /// давняя, уже пережитая ошибка не поднимает ложную тревогу при каждом перезапуске.
    /// </summary>
    public class WebhookHealthTests
    {
        private static readonly DateTime Now = new(2026, 9, 6, 12, 0, 0, DateTimeKind.Utc);
        private const string Configured = "https://shop.example/api/Telegram";

        private static WebhookHealthReport Inspect(
            string? registered,
            DateTime? lastError = null,
            string? errorMessage = null,
            int pending = 0,
            string? configured = Configured,
            WebhookReachability reachability = WebhookReachability.Reachable,
            string? reachabilityDetail = null) =>
            WebhookHealth.Inspect(
                registered, configured, lastError, errorMessage, pending, Now, reachability, reachabilityDetail);

        [Fact]
        public void NoWebhook_isReportedAsNotRegistered()
        {
            var report = Inspect(registered: "");

            Assert.Equal(WebhookDiagnosis.NotRegistered, report.Diagnosis);
        }

        [Fact]
        public void MatchingUrlWithoutErrors_isOk()
        {
            var report = Inspect(registered: Configured);

            Assert.Equal(WebhookDiagnosis.Ok, report.Diagnosis);
        }

        [Fact]
        public void StaleTunnelAddress_isReportedAsMismatch()
        {
            // Ровно случай сменившегося ngrok: Telegram помнит прошлый поддомен.
            var report = Inspect(registered: "https://d2ab-195-178-156-162.ngrok-free.app/api/Telegram");

            Assert.Equal(WebhookDiagnosis.UrlMismatch, report.Diagnosis);
            Assert.Contains("ngrok-free.app", report.Message);
            Assert.Contains(Configured, report.Message);
        }

        [Fact]
        public void MismatchOutranksErrors_becauseEverythingElseFollowsFromIt()
        {
            var report = Inspect(
                registered: "https://old.example/api/Telegram",
                lastError: Now.AddMinutes(-5),
                errorMessage: "Wrong response from the webhook: 404 Not Found",
                pending: 2);

            Assert.Equal(WebhookDiagnosis.UrlMismatch, report.Diagnosis);
        }

        [Fact]
        public void FreshFailure_isReportedWithItsReasonAndBacklog()
        {
            var report = Inspect(
                registered: Configured,
                lastError: Now.AddMinutes(-5),
                errorMessage: "Wrong response from the webhook: 404 Not Found",
                pending: 2);

            Assert.Equal(WebhookDiagnosis.DeliveryFailing, report.Diagnosis);
            Assert.Contains("404 Not Found", report.Message);
            Assert.Contains("2 update(s) waiting", report.Message);
        }

        [Fact]
        public void OldFailureWithEmptyQueue_doesNotRaiseAlarm()
        {
            // Telegram не сбрасывает last_error_date после удачной доставки: без окна давности
            // сервис ругался бы на давно пережитую неполадку при каждом старте.
            var report = Inspect(registered: Configured, lastError: Now.AddDays(-9), errorMessage: "Connection timed out");

            Assert.Equal(WebhookDiagnosis.PastErrors, report.Diagnosis);
        }

        [Fact]
        public void FailureExactlyAtTheWindowEdge_stillCountsAsCurrent()
        {
            var report = Inspect(registered: Configured, lastError: Now - WebhookHealth.RecentErrorWindow);

            Assert.Equal(WebhookDiagnosis.DeliveryFailing, report.Diagnosis);
        }

        [Fact]
        public void FailureWithoutReason_readsAsASentenceAnyway()
        {
            var report = Inspect(registered: Configured, lastError: Now.AddHours(-1), errorMessage: null);

            Assert.Equal(WebhookDiagnosis.DeliveryFailing, report.Diagnosis);
            Assert.Contains("no reason reported", report.Message);
        }

        [Theory]
        [InlineData("https://shop.example/api/Telegram")]
        [InlineData("https://SHOP.example/api/Telegram")]
        public void SameAddressWrittenDifferently_isNotAMismatch(string registered)
        {
            // Регистр хоста Telegram может вернуть иначе, чем записано в конфиге; ругаться
            // на это — учить не тому месту.
            Assert.Equal(WebhookDiagnosis.Ok, Inspect(registered).Diagnosis);
        }

        [Fact]
        public void DifferentPath_isAMismatch()
        {
            // А вот путь — не косметика: /api/Telegram и /api/telegram-old разные ручки.
            var report = Inspect(registered: "https://shop.example/api/telegram-old");

            Assert.Equal(WebhookDiagnosis.UrlMismatch, report.Diagnosis);
        }

        [Fact]
        public void UnconfiguredExpectedUrl_doesNotInventAMismatch()
        {
            // BotWebhookUrl не задан: сравнивать не с чем, но зарегистрированный адрес живой.
            var report = Inspect(registered: Configured, configured: null);

            Assert.Equal(WebhookDiagnosis.Ok, report.Diagnosis);
        }

        [Fact]
        public void ClockSkew_doesNotProduceAFailureInTheFuture()
        {
            var report = Inspect(registered: Configured, lastError: Now.AddSeconds(3), errorMessage: "Read timeout");

            Assert.Equal(WebhookDiagnosis.DeliveryFailing, report.Diagnosis);
            Assert.Contains("just now", report.Message);
        }

        [Fact]
        public void AddressThatAnswersNothing_isReportedAsUnreachable()
        {
            // Туннель не поднят: адрес зарегистрирован, но за ним пусто.
            var report = Inspect(
                registered: Configured,
                reachability: WebhookReachability.NoAnswer,
                reachabilityDetail: "No such host is known");

            Assert.Equal(WebhookDiagnosis.Unreachable, report.Diagnosis);
            Assert.Contains("No such host is known", report.Message);
        }

        [Fact]
        public void AddressTakenBySomeoneElse_isReportedAsWrongResponse()
        {
            // Освободившийся поддомен ngrok отдаёт свою страницу с 404.
            var report = Inspect(
                registered: Configured,
                reachability: WebhookReachability.AnsweredWrong,
                reachabilityDetail: "answered 404 to GET instead of 405");

            Assert.Equal(WebhookDiagnosis.WrongResponse, report.Diagnosis);
            Assert.Contains("404", report.Message);
        }

        [Fact]
        public void SilentChatWithADeadAddress_isNotPassedOffAsHealthy()
        {
            // Ровно тот случай, ради которого проверка и добавлена: боту сутки никто не писал,
            // очередь пуста, последняя ошибка старая — по данным Telegram всё «былое». Но
            // адрес мёртв, и это важнее.
            var report = Inspect(
                registered: Configured,
                lastError: Now.AddDays(-2),
                errorMessage: "Wrong response from the webhook: 404 Not Found",
                pending: 0,
                reachability: WebhookReachability.NoAnswer);

            Assert.Equal(WebhookDiagnosis.Unreachable, report.Diagnosis);
        }

        [Fact]
        public void MismatchStillOutranksTheProbe()
        {
            // Проверяли адрес из Telegram, а ждём мы другой: чинить надо адрес, остальное следствие.
            var report = Inspect(
                registered: "https://old.example/api/Telegram",
                reachability: WebhookReachability.NoAnswer);

            Assert.Equal(WebhookDiagnosis.UrlMismatch, report.Diagnosis);
        }

        [Fact]
        public void ProbeDoesNotHideAFreshDeliveryFailure()
        {
            // Адрес отвечает нам, но Telegram только что не смог доставить — это не «ок».
            var report = Inspect(
                registered: Configured,
                lastError: Now.AddMinutes(-5),
                errorMessage: "Read timeout",
                pending: 3,
                reachability: WebhookReachability.Reachable);

            Assert.Equal(WebhookDiagnosis.DeliveryFailing, report.Diagnosis);
        }

        [Fact]
        public void WithoutAProbe_theOldRulesStillApply()
        {
            // Проверку могли не делать (адреса нет, запрос не состоялся) — тогда судим по
            // тому, что сказал Telegram, как и раньше.
            var report = Inspect(
                registered: Configured,
                lastError: Now.AddDays(-9),
                reachability: WebhookReachability.NotChecked);

            Assert.Equal(WebhookDiagnosis.PastErrors, report.Diagnosis);
        }
    }
}
