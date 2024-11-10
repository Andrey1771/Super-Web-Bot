import {injectable} from "inversify";
import {IGameService} from "../iterfaces/i-game-service";
import { ISettingsService } from "../iterfaces/i-settings-service";
import {Game} from "../models/game";
import axios from "axios";
import { Settings } from "../models/settings";

const API_URL = 'https://localhost:7117/api/Settings'; // Замените на ваш URL

@injectable()
export class SettingsService implements ISettingsService {
    async getAllSettings(): Promise<Settings[]> {
        try {
            const response = await axios.get(API_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }
}