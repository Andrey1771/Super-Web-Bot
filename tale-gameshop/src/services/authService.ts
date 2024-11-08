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