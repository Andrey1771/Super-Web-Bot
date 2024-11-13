import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { container } from "./inversify.config";
import IDENTIFIERS from "./constants/identifiers";
import {IAuthStorageService} from "./iterfaces/i-auth-storage-service";

// Создаем экземпляр Axios
const apiClient = axios.create({
    baseURL: 'https://your-api-url.com', // Замените на ваш базовый URL API
    headers: {
        'Content-Type': 'application/json',
    },
});

const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

// Перехватчик запросов
apiClient.interceptors.request.use(
    (config: AxiosRequestConfig) => {
        const token = tokenStorage.getItem("token"); // Получаем токен (если он существует)
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
apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
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

export default apiClient;