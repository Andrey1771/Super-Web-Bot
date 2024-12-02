import {KeycloakInstance} from "keycloak-js";

export interface IKeycloakAuthService {
    loginWithRedirect(keycloak: KeycloakInstance): Promise<void>;
    logoutWithRedirect(keycloak: KeycloakInstance): Promise<void>;
    registerWithRedirect(keycloak: KeycloakInstance): Promise<void>;
}