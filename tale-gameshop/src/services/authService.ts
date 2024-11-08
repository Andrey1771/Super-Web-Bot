interface LoginResponse {
    token?: string; // Зависит от того, что возвращает ваш сервер
    // Добавьте другие поля ответа, если необходимо
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
    const response = await fetch('https://localhost:7083/api/Auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password: password }),
    });

    if (!response.ok) {
        throw new Error('Login failed');
    }

    const data = await response.json();
    return data;
};


interface RegisterResponse {
    // Укажите необходимые поля в зависимости от ответа вашего сервера
    success: boolean;
    message: string;
    token?: string; // Если сервер возвращает токен после регистрации
}

export const register = async (email: string, password: string): Promise<RegisterResponse> => {
    const response = await fetch('https://localhost:7083/api/Auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password: password }),
    });

    if (!response.ok) {
        throw new Error('Registration failed');
    }

    const data = await response.json();
    return data;
};