import React, {useEffect} from "react";
import {currentLang} from "../../../context/site-preferences";
import {useKeycloak} from "@react-keycloak/web";
import AppLoader from "../../app-loader/AppLoader";

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
            keycloak.login({redirectUri: window.location.href, locale: currentLang()});
        }
    }, [initialized, isLoggedIn, keycloak]);

    // Кабинет: ждать здесь честно — человек пришёл за своими заказами, и без личности их не показать.
    // Раньше здесь было null: заставку показывал общий провайдер, и до этого места
    // управление доходило уже с готовым ответом. Теперь провайдер детей не задерживает,
    // и без заставки человек увидел бы пустой экран, пока идёт check-sso или редирект
    // на форму входа.
    if (!initialized || !isLoggedIn) {
        return <AppLoader />;
    }

    return <>{children}</>;
};

export default AuthorizedRoute;
