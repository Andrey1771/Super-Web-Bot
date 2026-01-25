import {useKeycloak} from "@react-keycloak/web";
import React from "react";
import AccessDeniedPage from "../access-denied-page/access-denied-page";

type PrivateRouteProps = {
    children: React.ReactNode;
};

const PrivateRoute: React.FC<PrivateRouteProps> = ({children}) => {
    const {keycloak} = useKeycloak();

    const isLoggedIn = keycloak.authenticated;
    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const resourceRoles = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"] ?? [];
    // @ts-ignore Тип возвращаемых данных и объекта keycloak отличается
    const realmRoles = keycloak.tokenParsed?.realm_access?.roles ?? [];
    const roles = [...resourceRoles, ...realmRoles];
    const isAdminOrEditor = roles.some(role => role === "admin" || role === "editor");

    return isLoggedIn && isAdminOrEditor ? (<>{children}</>) : (
        <AccessDeniedPage></AccessDeniedPage>
    );
};

export default PrivateRoute;
