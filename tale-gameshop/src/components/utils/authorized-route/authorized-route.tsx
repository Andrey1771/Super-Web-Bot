import React, {useEffect} from "react";
import {useKeycloak} from "@react-keycloak/web";

type AuthorizedRouteProps = {
    children: React.ReactNode;
};

// Гейт личного кабинета (/account/*): достаточно факта логина, роли не нужны.
// Незалогиненного молча уводим на страницу входа Keycloak с возвратом обратно
// (важно для ссылок из писем: verify email / 2FA ведут на /account/security).
const AuthorizedRoute: React.FC<AuthorizedRouteProps> = ({ children }) => {
    const {keycloak, initialized} = useKeycloak();
    const isLoggedIn = Boolean(keycloak.authenticated);

    useEffect(() => {
        if (initialized && !isLoggedIn) {
            keycloak.login({redirectUri: window.location.href});
        }
    }, [initialized, isLoggedIn, keycloak]);

    if (!initialized || !isLoggedIn) {
        return null;
    }

    return <>{children}</>;
};

export default AuthorizedRoute;
