namespace SuperBot.Core.Services
{
    /// <summary>
    /// Единственное место, где решается «вышла игра или ещё нет».
    /// Статус выводится из даты релиза (сравнение строго в UTC), отдельного флага в базе нет:
    /// наступила дата — игра сама становится доступной к покупке, менять ничего не нужно.
    /// Использовать этот хелпер, а не сравнивать даты по месту, — иначе витрина и чекаут
    /// разойдутся во мнении, продаётся игра или нет.
    /// </summary>
    public static class GameRelease
    {
        public static bool IsUpcoming(DateTime releaseDate, DateTime utcNow) => releaseDate > utcNow;
    }
}
