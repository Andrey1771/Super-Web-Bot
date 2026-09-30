import {KeycloakInstance} from "keycloak-js";
import {AuthClientEvent, AuthClientInitOptions} from "@react-keycloak/core/lib/types";
import EventEmitter from 'eventemitter3';

export interface IKeycloakService {
    get keycloak(): KeycloakInstance;
    get initOptions(): AuthClientInitOptions;
    eventHandlers(e: AuthClientEvent): void;
    get stateChangedEmitter(): EventEmitter;
    /**
     * Сессия закончилась: токен обновить нельзя или API ответил 401 вошедшему. Снимает вход и шлёт
     * событие onSessionExpired — плашка предлагает войти заново. Повторные вызовы до нового входа — тихие.
     */
    markSessionExpired(): void;
}