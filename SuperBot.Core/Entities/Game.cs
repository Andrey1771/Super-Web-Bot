namespace SuperBot.Core.Entities
{
    public enum GameType
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

    public static class GameTypeMapper
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

        /// <summary>Порог «мало ключей» для этой игры. Пусто — общий порог по умолчанию (5).</summary>
        public int? LowStockThreshold { get; set; }

        /// <summary>
        /// С этой даты витрина показывает «скоро закончится» независимо от остатка — ручной ажиотаж
        /// (распродажа, конец тиража). Пусто — только по порогу.
        /// </summary>
        public DateTime? LowStockFromUtc { get; set; }

        /// <summary>
        /// Для DLC — id базовой игры. DLC — такой же товар (цена, ключи, страница), но в каталоге он
        /// не в общем списке, а в блоке «DLC» базовой игры; на его странице — «требуется базовая игра».
        /// </summary>
        public string? ParentGameId { get; set; }

        /// <summary>
        /// Политика активации по умолчанию для ключей этой игры (где работает, где нет). Пусто — везде.
        /// У партии ключей может быть своя политика, она важнее.
        /// </summary>
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }

        /// <summary>
        /// Цены региональных вариантов: европейский ключ дешевле глобального, «всё кроме RU» —
        /// ещё дешевле. Пусто (обычный случай) — все варианты продаются по цене игры, как и было
        /// до появления региональных цен.
        /// </summary>
        public List<SuperBot.Core.Regions.RegionPrice>? RegionPrices { get; set; }

        /// <summary>
        /// Ручные цены в других валютах: код валюты → сумма. Цена в базовой валюте сюда НЕ входит,
        /// её источник — <see cref="Price"/>, иначе одна и та же цена жила бы в двух местах.
        /// Валюты, которой здесь нет, цена берётся по курсу — это Этап 4; пока таких валют
        /// просто не показываем.
        /// </summary>
        public Dictionary<string, decimal>? Prices { get; set; }
        public string Description { get; set; }
        /// <summary>Переводы описания карточки (ru/uk/pl); Description — английское.</summary>
        public Dictionary<string, string>? DescriptionI18n { get; set; }
        public string Title { get; set; }
        /// <summary>Старый номер жанра. Читается только у документов до переезда на <see cref="Genre"/> и от старых клиентов API.</summary>
        public GameType GameType { get; set; }

        /// <summary>
        /// Жанр игры — Tag из Settings.GameCategories («action», «role-playing-games-rpgs»). Список жанров правится в админке.
        /// У ПО пусто: у него категория софта. Пусто у игры — жанр выводится из GameType (см. GameGenres.TagOf).
        /// </summary>
        public string? Genre { get; set; }

        /// <summary>Игра или ПО. По умолчанию игра — так читаются все документы, заведённые до появления ПО.</summary>
        public ProductKind Kind { get; set; } = ProductKind.Game;

        /// <summary>Категория софта (Tag из Settings.SoftwareCategories). У игр пусто — у них жанр в Genre.</summary>
        public string? SoftwareCategory { get; set; }
        public string ImagePath { get; set; }
        public string? CoverMediaId { get; set; }
        public DateTime ReleaseDate { get; set; }
    }
}
