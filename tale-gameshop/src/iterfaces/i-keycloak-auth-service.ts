import {KeycloakInstance} from "keycloak-js";

export interface IKeycloakAuthService {
    loginWithRedirect(keycloak: KeycloakInstance): Promise<void>
}