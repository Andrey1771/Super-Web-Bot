import React, { createContext, useContext, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {UserManager, WebStorageStateStore} from "oidc-client-ts";

export default class AuthService {
    private userManager: UserManager;
    constructor() {
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
            client_secret: "VacIN0mdxlOlEnyjuEQNffZVrt2gO8Kq",
            filterProtocolClaims: true,
        };
        
        
        this.userManager = new UserManager(config);
    }

    getUser() {
        return this.userManager.getUser();
    }

    login() {
        return this.userManager.signinRedirect();
    }

    loginCallback() {
        return this.userManager.signinRedirectCallback();
    }

    logout() {
        return this.userManager.signoutRedirect();
    }
}





interface AuthContextType {
    user: any;
    login: (user: string, callback: VoidFunction) => void;
    logout: (callback: VoidFunction) => void;
}

let AuthContext = createContext<AuthContextType>(null!);

const useAuth = () => useContext(AuthContext);



function AuthProvider({ children }: { children: React.ReactNode }) {
    let [user, setUser] = useState<any>(
        JSON.parse(
            sessionStorage.getItem(process.env.REACT_APP_SESSION_ID!) || "null"
        ) || undefined
    );

    const authService = new AuthService();

    const loginCallback = async () => {
        const authedUser = await authService.loginCallback();
        setUser(authedUser);
    };

    const login = () => authService.login();
    const logout = () => authService.logout();

    // Login and logout methods

    const value = { user, login, loginCallback, logout };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function AuthStatus() {
    let auth = useAuth();
    let navigate = useNavigate();

    if (!auth.user) {
        return <p>You are not logged in.</p>;
    }

    return (
        <p>
            Welcome {auth.user}!{" "}
            <button
                onClick={() => {
                    auth.logout(() => navigate("/"));
                }}
            >
                Sign out
            </button>
        </p>
    );
}

function RequireAuth({ children }: { children: JSX.Element }) {
    let auth = useAuth();
    let location = useLocation();

    if (!auth.user) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

export { useAuth, AuthStatus, RequireAuth, AuthProvider };
