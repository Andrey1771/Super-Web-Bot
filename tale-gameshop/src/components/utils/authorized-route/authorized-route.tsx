import React from "react";
import {useKeycloak} from "@react-keycloak/web";
import AccessDeniedPage from "../access-denied-page/access-denied-page";

type AuthorizedRouteProps = {
    children: React.ReactNode;
};

const AuthorizedRoute: React.FC<AuthorizedRouteProps> = ({ children }) => {
    const {keycloak} = useKeycloak();

    const isLoggedIn = keycloak.authenticated;

    return isLoggedIn ? (<>{children}</>) : (
        <AccessDeniedPage></AccessDeniedPage>
    );
};

export default AuthorizedRoute;