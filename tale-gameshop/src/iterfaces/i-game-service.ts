import {Game} from "../models/game";

export interface IGameService {
    // Получение всех игр
    getAllGames(): Promise<Game[]>

    // Получение игры по id
    getGameById(id: string): Promise<Game>;

    // Создание новой игры
    createGame(newGame: Game): Promise<Game>;

    // Обновление игры
    updateGame(id: string, updatedGame: Game): Promise<void>;

    // Удаление игры
    deleteGame(id: string): Promise<void>;
}