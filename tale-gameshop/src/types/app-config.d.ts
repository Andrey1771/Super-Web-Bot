export type AppConfig = {
    apiBaseUrl?: string;
    publicAppUrl?: string;
    stripePublishableKey?: string;
    keycloak?: {
        url?: string;
        realm?: string;
        clientId?: string;
        redirectUri?: string;
        silentCheckSsoRedirectUri?: string;
        onLoad?: "login-required" | "check-sso";
    };
};

declare global {
    interface Window {
        __APP_CONFIG__?: AppConfig;
    }
}
