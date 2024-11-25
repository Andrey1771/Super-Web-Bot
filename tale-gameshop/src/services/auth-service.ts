import { LoginResponse } from "../models/login-response";
import { RegisterResponse } from "../models/register-response";
import axios from 'axios';
import { UserManager, WebStorageStateStore } from "oidc-client-ts";
let { Issuer } = require("openid-client");

/*export const login = async (email: string, password: string): Promise<LoginResponse> => {
    try {
        const response = await axios.post('https://localhost:7083/api/Auth/login', {
            username: email,
            password: password,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        throw new Error('Login failed');
    }
};*/

export const register = async (email: string, password: string): Promise<RegisterResponse> => {
    try {
        const response = await axios.post('https://localhost:7083/api/Auth/register', {
            username: email,
            password: password,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        throw new Error('Registration failed');
    }
};

/*const config = {
    authority: "https://localhost:7083/api/Auth/login", // IdentityServer
    client_id: "tale-gameshop",
    redirect_uri: "https://localhost:7117/", // URL для редиректа после логина callback
    response_type: "code",
    scope: "openid profile api1 roles",
    post_logout_redirect_uri: "https://localhost:7117/",
};*/

// const userManager = new UserManager({
//     authority: 'https://localhost:7083', // URL вашего IdentityServer
//     client_id: 'tale-gameshop',
//     redirect_uri: 'http://localhost:3000/login',
//     post_logout_redirect_uri: 'http://localhost:3000/logout-callback',
//     response_type: 'code',
//     scope: 'openid profile api_scope',
//     automaticSilentRenew: true,
//     silent_redirect_uri: 'http://localhost:3000/silent-refresh',
//     userStore: new WebStorageStateStore({ store: window.localStorage }),
// });

/*async function setupClient() {
    // Загружаем метаданные провайдера (IdentityServer)
    const issuer = await Issuer.discover('https://localhost:7083'); // Замените на адрес вашего IdentityServer

    // Создаём клиента
    const client = new issuer.Client({
        client_id: 'tale-gameshop',
        redirect_uris: ['http://localhost:3000/login'], // Укажите ваш redirect_uri
        response_types: ['code'], // Используем Authorization Code Flow
    });

    return client;
}

async function redirectToLogin() {
    const client = await setupClient();

    const authUrl = client.authorizationUrl({
        scope: 'openid profile api_scope',
        code_challenge: '...', // Сгенерируйте код-вызывающее значение (PKCE)
        code_challenge_method: 'S256',
    });

    // Перенаправление пользователя на страницу авторизации
    window.location.href = authUrl;
}*/

/*
const userManager = new UserManager({
    authority: 'https://localhost:7083', // URL вашего IdentityServer
    client_id: 'tale-gameshop',
    redirect_uri: 'http://localhost:3000/login',
    post_logout_redirect_uri: 'http://localhost:3000/logout-callback',
    response_type: 'code',
    scope: 'openid profile api_scope',
    automaticSilentRenew: true,
    silent_redirect_uri: 'http://localhost:3000/silent-refresh',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
});

console.log(userManager.settings);

export const redirectToLogin = () => userManager.signinRedirect();
export const logout = () => userManager.signoutRedirect();
export const getUser = () => userManager.getUser();
export const renewToken = () => userManager.signinSilent();
*/

const config = {
    authority: 'http://localhost:8180/realms/Tale-Shop', // URL вашего Realm
    client_id: 'tale-shop-app', // ID клиента в Keycloak
    redirect_uri: 'http://localhost:3000/callback', // URL редиректа после входа
    post_logout_redirect_uri: 'http://localhost:3000', // URL после выхода
    response_type: 'code', // Используем Authorization Code Flow
    scope: 'openid profile email', // Запрашиваемые скоупы
    loadUserInfo: true, // Получение дополнительной информации о пользователе
    stateStore: new WebStorageStateStore({ store: window.localStorage }), // Хранилище состояния
    automaticSilentRenew: true, // Автоматическое обновление токенов
    silent_redirect_uri: 'http://localhost:3000/silent-renew', // URL для тихого обновления токенов
};

export const userManager = new UserManager(config);

userManager.events.addUserSignedOut(async () => {
    console.log('User signed out');
    await userManager?.removeUser();
    window.location.reload();
});

userManager.events.addSilentRenewError(async error => {
    console.error(`Silent renew error: ${error}`);
    if (error.message === 'login_required') {
        await logout();
        return;
    }
    //retrySigninSilent();
});

/*retrySigninSilent() {
    console.log('Retry signin silent');
    this._userManager?.signinSilent().catch(async error => {
        console.error(`Signin silent error: ${error}`);
        if (error.message === 'login_required') {
            await this.logout();
        } else {
            if (this.retrySigninSilentTimeout != null)
                window.clearTimeout(this.retrySigninSilentTimeout);
            this.retrySigninSilentTimeout = window.setTimeout(
                () => this.retrySigninSilent(),
                this.RETRY_SIGNIN_TIMEOUT_IN_MS
            );
        }
    });
}*/

userManager.events.addAccessTokenExpired(async () => {
    console.warn('Access token expired');
    await userManager?.removeUser();
    window.location.reload();
});

// Функция для входа
export const redirectToLogin = async () => {
    await userManager.signinRedirect();
};

// Функция для выхода
export const logout = async () => {
    await userManager.signoutRedirect();
};

// Функция для обработки редиректа
export const completeLogin = async () => {
    const user = await userManager.signinRedirectCallback();
    return user;
};