import {injectable} from 'inversify';
import { IGameService } from '../iterfaces/i-game-service';
import { Game } from '../models/game';
import IDENTIFIERS from "../constants/identifiers";
import type {IApiClient} from "../iterfaces/i-api-client";
import container from '../inversify.config';

const API_URL = 'https://localhost:7117/api/Game'; // Замените на ваш URL

@injectable()
export class GameService implements IGameService {
    //@resolve(IDENTIFIERS.IApiClient) private apiClient!: IApiClient;

    private readonly _apiClient: IApiClient;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    // Получение всех игр
    async getAllGames(): Promise<Game[]> {
        try {
            const response = await this._apiClient.api.get(API_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }

    // Получение игры по id
    async getGameById(id: string): Promise<Game> {
        try {
            const response = await this._apiClient.api.get(`${API_URL}/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching game by ID:', error);
            throw error;
        }
    }

    // Создание новой игры
    async createGame(newGame: Game): Promise<Game> {
        try {
            const response = await this._apiClient.api.post(API_URL, newGame);
            return response.data;
        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    }

    // Обновление игры
    async updateGame(id: string, updatedGame: Game): Promise<void> {
        try {
            await this._apiClient.api.put(`${API_URL}/${id}`, updatedGame);
        } catch (error) {
            console.error('Error updating game:', error);
            throw error;
        }
    }

    // Удаление игры
    async deleteGame(id: string): Promise<void> {
        try {
            await this._apiClient.api.delete(`${API_URL}/${id}`);
        } catch (error) {
            console.error('Error deleting game:', error);
            throw error;
        }
    }
}