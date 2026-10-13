import type { KeycloakOnLoad } from "keycloak-js";

export interface KeycloakSettings {
    url: string;
    realm: string;
    clientId: string;
    redirectUri: string;
    silentCheckSsoRedirectUri: string;
    onLoad: KeycloakOnLoad;
}

export interface IUrlService {
    get apiBaseUrl(): string;
    get keycloak(): KeycloakSettings;
}