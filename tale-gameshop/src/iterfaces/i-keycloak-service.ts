import {KeycloakInstance} from "keycloak-js";
import {AuthClientInitOptions} from "@react-keycloak/core/lib/types";

export interface IKeycloakService {
    get keycloak(): KeycloakInstance;
    get initOptions(): AuthClientInitOptions;
}