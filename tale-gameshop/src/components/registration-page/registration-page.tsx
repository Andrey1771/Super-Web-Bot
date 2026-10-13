import React, {useEffect} from "react";
import {Navigate} from "react-router-dom";
import {useKeycloak} from "@react-keycloak/web";
import container from "../../inversify.config";
import type {IKeycloakAuthService} from "../../iterfaces/i-keycloak-auth-service";
import IDENTIFIERS from "../../constants/identifiers";
import { analyticsClient } from "../../utils/analytics-client";

// Регистрацией владеет Keycloak: /signUp сразу уводит на его страницу регистрации
// с возвратом на сайт. Раньше здесь была нерабочая форма-муляж.
export default function RegistrationPage() {
    const {keycloak, initialized} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    useEffect(() => {
        if (initialized && !keycloak.authenticated) {
            analyticsClient.trackEvent("sign_up");
            void keycloakAuthService.registerWithRedirect(keycloak, window.location.origin);
        }
    }, [initialized, keycloak, keycloakAuthService]);

    if (initialized && keycloak.authenticated) {
        return <Navigate to="/" replace />;
    }

    return null;
}
