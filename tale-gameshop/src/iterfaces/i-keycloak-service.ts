import {KeycloakInstance} from "keycloak-js";
import {AuthClientEvent, AuthClientInitOptions} from "@react-keycloak/core/lib/types";
import EventEmitter from 'eventemitter3';

export interface IKeycloakService {
    get keycloak(): KeycloakInstance;
    get initOptions(): AuthClientInitOptions;
    eventHandlers(e: AuthClientEvent): void;
    get stateChangedEmitter(): EventEmitter;
}