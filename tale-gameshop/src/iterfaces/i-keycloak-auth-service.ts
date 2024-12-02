import {KeycloakInstance} from "keycloak-js";

export interface IKeycloakAuthService {
    loginWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void>;
    logoutWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void>;
    registerWithRedirect(keycloak: KeycloakInstance, uri: string): Promise<void>;
}