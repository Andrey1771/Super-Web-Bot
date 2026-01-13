import React, {useEffect} from "react";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type {IKeycloakAuthService} from "../../../iterfaces/i-keycloak-auth-service";

type AuthenticatedRouteProps = {
    children: React.ReactNode;
};

const AuthenticatedRoute: React.FC<AuthenticatedRouteProps> = ({children}) => {
    const {keycloak} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    useEffect(() => {
        if (!keycloak.authenticated) {
            keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
        }
    }, [keycloak, keycloakAuthService]);

    if (!keycloak.authenticated) {
        return null;
    }

    return <>{children}</>;
};

export default AuthenticatedRoute;
