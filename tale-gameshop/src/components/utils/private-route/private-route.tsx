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
    const isAdmin = keycloak.tokenParsed?.resource_access?.["tale-shop-app"]?.["roles"].some(role => role === "admin");

    return isLoggedIn && isAdmin ? (<>{children}</>) : (
        <AccessDeniedPage></AccessDeniedPage>
    );
};

export default PrivateRoute;
