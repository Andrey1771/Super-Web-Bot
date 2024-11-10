// Типы данных для игры
export interface Game {
    id?: string;
    name: string;
    description: string;
    price: number;
    title: string;
    gameType: number; // Соотносится с сервером
    imagePath: string;
    releaseDate: string;
    // добавьте другие поля в зависимости от структуры вашего объекта Game
}