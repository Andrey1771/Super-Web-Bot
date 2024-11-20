import axios, {AxiosResponse, AxiosError, AxiosInstance} from 'axios';
import {inject, injectable} from "inversify";
import type {IAuthStorageService} from "../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../constants/identifiers";
import {resolve} from "inversify-react";
import type {ISettingsService} from "../iterfaces/i-settings-service";
import { IApiClient } from '../iterfaces/i-api-client';
import container from "../inversify.config";

@injectable()
export class ApiClient implements IApiClient {
    private readonly _api: AxiosInstance;

    private _tokenStorage!: IAuthStorageService;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

        this._api = axios.create({
            baseURL: 'https://your-api-url.com', // Замените на ваш базовый URL API
            headers: {
                'Content-Type': 'application/json',
            },
        });

// Перехватчик запросов
        this._api.interceptors.request.use(
            (config: any) => {
                debugger;
                const token = this._tokenStorage.getItem("token"); // Получаем токен (если он существует)
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
                debugger;
                // Можно добавить логику обработки успешных ответов, если нужно
                return response;
            },
            (error: AxiosError) => {
                // Обработка ошибок
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