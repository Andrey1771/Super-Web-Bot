import {IAuthStorageService} from "../iterfaces/i-auth-storage-service";
const Cookies = require('js-cookie');

export class CookieStorage implements IAuthStorageService {
    getItem(key: string): string | undefined {
        return Cookies.get(key);
    }

    setItem(key: string, value: string): void {
        Cookies.set(key, value, {
            // Настройки безопасности:
            expires: 7, // Количество дней, на которое хранится токен
            secure: true, // Используйте secure, чтобы куки работали только по HTTPS (в продакшене)
            sameSite: 'Strict', // Защита от CSRF-атак, можно использовать 'Strict' или 'Lax'
        });
    }
}