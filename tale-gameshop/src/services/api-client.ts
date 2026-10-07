import axios, {AxiosResponse, AxiosError, AxiosInstance} from 'axios';
import {injectable} from "inversify";
import IDENTIFIERS from "../constants/identifiers";
import { IApiClient } from '../iterfaces/i-api-client';
import container from "../inversify.config";
import { IKeycloakService } from '../iterfaces/i-keycloak-service';
import {IUrlService} from "../iterfaces/i-url-service";
import { currentCountry, currentLang } from "../context/site-preferences";

/** Сколько раз повторять запрос, отбитый лимитом частоты nginx. */
export const EDGE_RETRY_LIMIT = 2;

/**
 * Пауза перед повтором запроса, который nginx отбил лимитом частоты (429 с пометкой edge), или null — повторять
 * не нужно. Лимит отбивает запрос до бэкенда, поэтому повтор безопасен и для POST; ответы 429 самого бэкенда
 * (повторная отправка ключей раз в 10 минут, перебор промокодов) пометки не имеют — их показываем как есть.
 */
export const edgeRetryDelayMs = (error: AxiosError): number | null => {
    const response = error.response;
    const config = error.config as ({ __edgeRetries?: number } | undefined);
    if (!response || response.status !== 429 || !config) return null;
    if ((response.data as { edge?: boolean } | undefined)?.edge !== true) return null;
    if ((config.__edgeRetries ?? 0) >= EDGE_RETRY_LIMIT) return null;
    const retryAfter = Number(response.headers?.['retry-after']);
    const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
    // Разброс — чтобы повторы десятка запросов страницы не ушли одной пачкой и не упёрлись снова.
    return base + Math.round(Math.random() * 500);
};

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
            async (error: AxiosError) => {
                const retry = edgeRetryDelayMs(error);
                if (retry !== null) {
                    const config = error.config as (typeof error.config & { __edgeRetries?: number });
                    config.__edgeRetries = (config.__edgeRetries ?? 0) + 1;
                    await new Promise((resolve) => setTimeout(resolve, retry));
                    return this._api.request(config);
                }
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