import {injectable} from 'inversify';
import IDENTIFIERS from "../constants/identifiers";
import type {IApiClient} from "../iterfaces/i-api-client";
import container from '../inversify.config';
import {IAdminService} from "../iterfaces/i-admin-service";

const API_URL = '/api/admin/data'; // Замените на ваш URL

@injectable()
export class AdminService implements IAdminService {
    private readonly _apiClient: IApiClient;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    }

    // Получение всех игр
    async getAllMappedLoginEvents(): Promise<any> {
        try {
            const response = await this._apiClient.api.get(API_URL);
            return response.data;
        } catch (error) {
            console.error('Error fetching games:', error);
            throw error;
        }
    }
}