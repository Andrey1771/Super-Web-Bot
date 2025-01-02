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
        public string Id { get; set; }
        public string Name { get; set; }
        public decimal Price { get; set; }
        public string Description { get; set; }
        public string Title { get; set; }
        public GameType GameType { get; set; }
        public string ImagePath { get; set; }
        public DateTime ReleaseDate { get; set; }
    }
}
