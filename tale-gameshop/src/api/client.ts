import container from "../inversify.config";
import IDENTIFIERS from "../constants/identifiers";
import type { IApiClient } from "../iterfaces/i-api-client";

/**
 * Axios-клиент приложения: токен, Accept-Language и обработка сессии уже настроены в IApiClient.
 * Одна точка доступа для модулей API вместо копии этой строки в каждом файле.
 */
export const apiClient = () => container.get<IApiClient>(IDENTIFIERS.IApiClient).api;
