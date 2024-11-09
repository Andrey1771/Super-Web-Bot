export interface RegisterResponse {
    // Укажите необходимые поля в зависимости от ответа вашего сервера
    success: boolean;
    message: string;
    token?: string; // Если сервер возвращает токен после регистрации
}