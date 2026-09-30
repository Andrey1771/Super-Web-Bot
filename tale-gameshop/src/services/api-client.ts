import axios, {AxiosResponse, AxiosError, AxiosInstance} from 'axios';
import {injectable} from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import { IApiClient } from '../iterfaces/i-api-client';
import container from "../inversify.config";
import { IKeycloakService } from '../iterfaces/i-keycloak-service';
import {IUrlService} from "../iterfaces/i-url-service";
import { currentCountry, currentLang } from "../context/site-preferences";

@injectable()
export class ApiClient implements IApiClient {
    private readonly _api: AxiosInstance;

    private _keycloakService!: IKeycloakService;

    constructor() {
        //TODO Почему-то не resolve по нормальному, Проблема в том, что действие в сервисе, а не в компоненте?
        this._keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);

        this._api = axios.create({
            baseURL: container.get<IUrlService>(IDENTIFIERS.IUrlService).apiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
        });

// Перехватчик запросов
        this._api.interceptors.request.use(
            async (config: any) => {
                const keycloak = this._keycloakService.keycloak;
                // Токен доступа живёт пять минут. Перед запросом обновляем его, если он истёк или истечёт
                // в ближайшие 30 секунд, — иначе после пяти минут на странице любой вход в API давал 401,
                // хотя человек оставался «вошедшим». Не получилось обновить — шлём как есть: сервер
                // ответит 401 сам, а не мы заранее.
                if (keycloak?.authenticated && typeof keycloak.updateToken === 'function') {
                    try {
                        await keycloak.updateToken(30);
                    } catch {
                        // Сессия Keycloak могла закончиться — решает сервер по токену ниже.
                    }
                }
                const token = keycloak?.token;
                if (token) {
                    config.headers = {
                        ...config.headers,
                        Authorization: `Bearer ${token}`,
                    };
                }
                // Страна покупателя — сервер по ней говорит, где активируется ключ, и выдаёт подходящий.
                const country = currentCountry();
                if (country) {
                    config.headers = { ...config.headers, 'X-Buyer-Country': country };
                }
                // Язык сайта — сервер записывает его в заказ и шлёт письма на нём. Язык браузера
                // тут не подходит: покупатель мог выбрать в шапке другой.
                config.headers = { ...config.headers, 'Accept-Language': currentLang() };
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
                if (error.response && error.response.status === 401 && this._keycloakService.keycloak?.authenticated) {
                    // 401 у вошедшего — токен мёртв, обновить перед запросом не удалось: сессия закончилась.
                    // Снимаем вход и показываем плашку «Session expired» вместо молчаливых ошибок.
                    this._keycloakService.markSessionExpired();
                }
                return Promise.reject(error);
            }
        );

    }

    public get api(): AxiosInstance {
        return this._api;
    }
}