export type AppConfig = {
    apiBaseUrl?: string;
    stripePublishableKey?: string;
    keycloak?: {
        url?: string;
        realm?: string;
        clientId?: string;
        redirectUri?: string;
        silentCheckSsoRedirectUri?: string;
        onLoad?: string;
    };
};

declare global {
    interface Window {
        __APP_CONFIG__?: AppConfig;
    }
}
