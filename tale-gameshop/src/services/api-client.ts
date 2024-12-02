import axios, {AxiosResponse, AxiosError, AxiosInstance} from 'axios';
import {injectable} from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import { IApiClient } from '../iterfaces/i-api-client';
import container from "../inversify.config";
import webSettings from '../webSettings.json';
import { IKeycloakService } from '../iterfaces/i-keycloak-service';

@injectable()
export class ApiClient implements IApiClient {
    private readonly _api: AxiosInstance;

    private _keycloakService!: IKeycloakService;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);

        this._api = axios.create({
            baseURL: webSettings.apiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
        });

// Перехватчик запросов
        this._api.interceptors.request.use(
            (config: any) => {
                const token = this._keycloakService.keycloak.token; // Получаем токен (если он существует)
                if (token) {
                    config.headers = {
                        ...config.headers,
                        Authorization: `Bearer ${token}`,
                    };
                }
                return config;
            },
            (error: AxiosError) => {
                return Promise.reject(error);
            }
        );

// Перехватчик ответов
        this._api.interceptors.response.use(
            (response: AxiosResponse) => {
                return response;
            },
            (error: AxiosError) => {
                if (error.response && error.response.status === 401) {
                    // Логика при 401 Unauthorized, например, разлогин пользователя
                    console.error('Unauthorized, redirecting to login...');
                }
                return Promise.reject(error);
            }
        );

    }

    public get api(): AxiosInstance {
        return this._api;
    }
}