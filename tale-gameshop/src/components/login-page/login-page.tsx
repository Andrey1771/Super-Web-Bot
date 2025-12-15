import React from "react";
import {useKeycloak} from "@react-keycloak/web";
import './login-page.css';
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";

const LoginForm: React.FC = () => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    const handleLogin = async () => {
        await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
    };

    const handleRegister = async () => {
        await keycloakAuthService.registerWithRedirect(keycloak, window.location.href);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 space-y-6 border border-gray-100">
                <div className="text-center space-y-2">
                    <p className="text-xs uppercase tracking-widest text-gray-500">TALESHOP</p>
                    <h1 className="text-3xl font-bold text-gray-900">Вход в аккаунт</h1>
                    <p className="text-sm text-gray-600">Безопасная авторизация через Keycloak. Никаких лишних полей.</p>
                </div>
                <div className="space-y-3">
                    <button
                        onClick={handleLogin}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition"
                    >
                        Войти через Keycloak
                    </button>
                    <button
                        onClick={handleRegister}
                        className="w-full py-3 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:border-indigo-200 hover:text-indigo-700 transition"
                    >
                        Зарегистрироваться
                    </button>
                </div>
                <div className="text-xs text-center text-gray-500">
                    Демо-доступ: используйте аккаунты из README, реальные личные данные не требуются.
                </div>
            </div>
        </div>
    );
};

export default LoginForm;
