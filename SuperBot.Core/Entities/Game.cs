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

    public class Game
    {
        public string Name { get; set; }
        public decimal Price { get; set; }
        public string Description { get; set; }
        public string Title { get; set; }
        public GameType GameType { get; set; }
        public string ImagePath { get; set; }
        public DateTime ReleaseDate { get; set; }
    }
}
