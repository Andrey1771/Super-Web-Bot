import {injectable} from "inversify";
import { ISettingsService } from "../iterfaces/i-settings-service";
import { Settings } from "../models/settings";
import container from "../inversify.config";
import type {IApiClient} from "../iterfaces/i-api-client";
import IDENTIFIERS from "../constants/identifiers";

const API_URL = 'https://localhost:7117/api/Settings'; // Замените на ваш URL

@injectable()
export class SettingsService implements ISettingsService {
    async getAllSettings(): Promise<Settings[]> {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get(API_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }
}