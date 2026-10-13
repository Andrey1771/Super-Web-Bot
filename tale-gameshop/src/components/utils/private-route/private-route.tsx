import {useKeycloak} from "@react-keycloak/web";
import {currentLang} from "../../../context/site-preferences";
import AppLoader from "../../app-loader/AppLoader";
import React, {useEffect} from "react";
import NotFoundPage from "../not-found-page/not-found-page";

type PrivateRouteProps = {
    children: React.ReactNode;
};

// Гейт админ-зоны (/admin/*): требуется логин + служебная роль (admin/editor/support).
// Незалогиненного молча уводим на страницу входа Keycloak с возвратом обратно.
// Залогиненному без ролей показываем 404 — не подтверждаем существование админки.
const PrivateRoute: React.FC<PrivateRouteProps> = ({children}) => {
    const {keycloak, initialized} = useKeycloak();
    const isLoggedIn = Boolean(keycloak.authenticated);

    useEffect(() => {
        if (initialized && !isLoggedIn) {
            keycloak.login({redirectUri: window.location.href, locale: currentLang()});
        }
    }, [initialized, isLoggedIn, keycloak]);

    // Пока Keycloak не закончил check-sso (или уже уводим на логин) — ничего не рисуем.
    // Админка: то же самое, плюс проверка ролей ниже.
    // Раньше здесь было null: заставку показывал общий провайдер, и до этого места
    // управление доходило уже с готовым ответом. Теперь провайдер детей не задерживает,
    // и без заставки человек увидел бы пустой экран, пока идёт check-sso или редирект
    // на форму входа.
    if (!initialized || !isLoggedIn) {
        return <AppLoader />;
    }

    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const resourceRoles = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"] ?? [];
    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const realmRoles = keycloak.tokenParsed?.realm_access?.roles ?? [];
    const roles = [...resourceRoles, ...realmRoles];
    const hasStaffRole = roles.some(role => role === "admin" || role === "editor" || role === "support");

    return hasStaffRole ? (<>{children}</>) : (<NotFoundPage />);
};

export default PrivateRoute;
