export interface KeycloakSettings {
    url: string;
    realm: string;
    clientId: string;
    redirectUri: string;
    silentCheckSsoRedirectUri: string;
    onLoad: string;
}

export interface IUrlService {
    get apiBaseUrl(): string;
    get keycloak(): KeycloakSettings;
}