namespace SuperBot.Core.Entities
{
    public enum GameType //TODO
    {
        Action,
        Adventure,
        RolePlayingGames, // RPGs
        Simulation,
        Strategy,
        Puzzle,
        Sports,
        CardAndBoardGames,
        MassivelyMultiplayerOnline, // MMO
        Horror,
        CasualGames,
        EducationalGames
    }

    public static class GameTypeMapper //TODO
    {
        public static readonly Dictionary<GameType, string> DescriptionsCategories = new Dictionary<GameType, string>
        {
            { GameType.Action, "Action" },
            { GameType.Adventure, "Adventure" },
            { GameType.RolePlayingGames, "Role-Playing Games (RPGs)" },
            { GameType.Simulation, "Simulation" },
            { GameType.Strategy, "Strategy" },
            { GameType.Puzzle, "Puzzle" },
            { GameType.Sports, "Sports" },
            { GameType.CardAndBoardGames, "Card and Board Games" },
            { GameType.MassivelyMultiplayerOnline, "Massively Multiplayer Online (MMO)" },
            { GameType.Horror, "Horror" },
            { GameType.CasualGames, "Casual Games" },
            { GameType.EducationalGames, "Educational Games" }
        };
    }

    public class Game
    {
        // Id назначается сервером (Mongo генерит ObjectId при пустом значении), ExternalId/CoverMediaId опциональны —
        // поэтому nullable: иначе [ApiController] считает их обязательными и форма создания игры падает в 400.
        public string? Id { get; set; }
        public string? ExternalId { get; set; }
        public string Slug { get; set; }
        public string Name { get; set; }

        /// <summary>Базовая цена игры, выражена в <see cref="Currency"/>.</summary>
        public decimal Price { get; set; }

        /// <summary>
        /// Валюта базовой цены. У записей, заведённых до мультивалютности, пусто — это USD:
        /// именно в долларах каталог вёлся фактически (рубли в админке были багом форматтера).
        /// Подставляется миграцией и всё равно трактуется как USD при чтении.
        /// </summary>
        public string? Currency { get; set; }

        /// <summary>
        /// Ручные цены в других валютах: код валюты → сумма. Цена в базовой валюте сюда НЕ входит,
        /// её источник — <see cref="Price"/>, иначе одна и та же цена жила бы в двух местах.
        /// Валюты, которой здесь нет, цена берётся по курсу — это Этап 4; пока таких валют
        /// просто не показываем.
        /// </summary>
        public Dictionary<string, decimal>? Prices { get; set; }
        public string Description { get; set; }
        public string Title { get; set; }
        public GameType GameType { get; set; }
        public string ImagePath { get; set; }
        public string? CoverMediaId { get; set; }
        public DateTime ReleaseDate { get; set; }
    }
}
