import React, {useEffect} from "react";
import {Navigate} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";
import { analyticsClient } from "../../utils/analytics-client";

// Аутентификацией владеет Keycloak: /logIn сразу уводит на его страницу входа
// (тема tale-shop) с возвратом на сайт. Раньше здесь была нерабочая форма-муляж.
const LoginPage: React.FC = () => {
    const {keycloak, initialized} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    useEffect(() => {
        if (initialized && !keycloak.authenticated) {
            analyticsClient.trackEvent("login");
            void keycloakAuthService.loginWithRedirect(keycloak, window.location.origin);
        }
    }, [initialized, keycloak, keycloakAuthService]);

    if (initialized && keycloak.authenticated) {
        return <Navigate to="/" replace />;
    }

    return null;
};

export default LoginPage;
