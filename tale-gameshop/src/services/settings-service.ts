import {injectable} from "inversify";
import { ISettingsService } from "../iterfaces/i-settings-service";
import { Settings } from "../models/settings";
import container from "../inversify.config";
import type {IApiClient} from "../iterfaces/i-api-client";
import IDENTIFIERS from "../constants/identifiers";
import { settingsMock } from "./settings.mock";

const API_URL = '/api/Settings'; // Замените на ваш URL

@injectable()
export class SettingsService implements ISettingsService {
    async getAllSettings(): Promise<Settings[]> {
        const shouldUseApi = process.env.REACT_APP_USE_SETTINGS_API === 'true';

        if (!shouldUseApi) {
            return settingsMock;
        }

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get(API_URL);
            return response.data;
        } catch (error) {
            console.warn('Falling back to mock settings data.', error);
            return settingsMock;
        }
    }
}
