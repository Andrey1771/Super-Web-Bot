import {injectable} from 'inversify';
import { Game } from '../models/game';
import IDENTIFIERS from "../constants/identifiers";
import type {IApiClient} from "../iterfaces/i-api-client";
import container from '../inversify.config';

const API_URL = '/api/Game'; // Замените на ваш URL

@injectable()
export class AdminService implements IAdminService {
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
}