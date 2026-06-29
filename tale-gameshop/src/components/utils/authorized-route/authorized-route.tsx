import React from "react";
import {useKeycloak} from "@react-keycloak/web";
import AccessDeniedPage from "../access-denied-page/access-denied-page";

type AuthorizedRouteProps = {
    children: React.ReactNode;
};

const AuthorizedRoute: React.FC<AuthorizedRouteProps> = ({ children }) => {
    const {keycloak, initialized} = useKeycloak();

    // Пока Keycloak не закончил check-sso, authenticated ещё false — не показываем Access Denied (иначе он мелькает при перезагрузке).
    if (!initialized) {
        return null;
    }

    const isLoggedIn = keycloak.authenticated;

    return isLoggedIn ? (<>{children}</>) : (
        <AccessDeniedPage></AccessDeniedPage>
    );
};

export default AuthorizedRoute;