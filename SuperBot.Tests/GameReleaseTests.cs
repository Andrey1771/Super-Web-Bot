using SuperBot.Core.Services;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// «Вышла игра или нет» выводится только из даты релиза — фиксируем границу,
    /// чтобы витрина и чекаут никогда не разошлись в этом вопросе.
    /// </summary>
    public class GameReleaseTests
    {
        private static readonly DateTime Now = new(2026, 8, 4, 12, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void Future_release_date_means_upcoming() =>
            Assert.True(GameRelease.IsUpcoming(Now.AddDays(1), Now));

        [Fact]
        public void Past_release_date_means_released() =>
            Assert.False(GameRelease.IsUpcoming(Now.AddDays(-1), Now));

        [Fact]
        public void Release_moment_itself_means_released()
        {
            // Граница включительная: в саму секунду релиза игра уже продаётся.
            Assert.False(GameRelease.IsUpcoming(Now, Now));
        }

        [Fact]
        public void Default_date_of_legacy_games_means_released()
        {
            // У старых игр дата могла остаться незаполненной (default) — они считаются вышедшими.
            Assert.False(GameRelease.IsUpcoming(default, Now));
        }
    }
}
