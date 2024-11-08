import axios from 'axios';

const API_URL = 'https://localhost:7083/api/game'; // Замените на ваш URL

// Типы данных для игры
interface Game {
    id?: string;
    name: string;
    description: string;
    // добавьте другие поля в зависимости от структуры вашего объекта Game
}

class GameService {
    // Получение всех игр
    async getAllGames(): Promise<Game[]> {
        try {
            const response = await axios.get(API_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }

    // Получение игры по id
    async getGameById(id: string): Promise<Game> {
        try {
            const response = await axios.get(`${API_URL}/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching game by ID:', error);
            throw error;
        }
    }

    // Создание новой игры
    async createGame(newGame: Game): Promise<Game> {
        try {
            const response = await axios.post(API_URL, newGame);
            return response.data;
        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    }

    // Обновление игры
    async updateGame(id: string, updatedGame: Game): Promise<void> {
        try {
            await axios.put(`${API_URL}/${id}`, updatedGame);
        } catch (error) {
            console.error('Error updating game:', error);
            throw error;
        }
    }

    // Удаление игры
    async deleteGame(id: string): Promise<void> {
        try {
            await axios.delete(`${API_URL}/${id}`);
        } catch (error) {
            console.error('Error deleting game:', error);
            throw error;
        }
    }
}

export default new GameService();