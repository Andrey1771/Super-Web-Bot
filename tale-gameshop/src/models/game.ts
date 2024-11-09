// Типы данных для игры
export interface Game {
    id?: string;
    name: string;
    description: string;
    price: number;
    title: string;
    gameType: GameType;
    imagePath: string;
    releaseDate: string;
    // добавьте другие поля в зависимости от структуры вашего объекта Game
}

enum GameType
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