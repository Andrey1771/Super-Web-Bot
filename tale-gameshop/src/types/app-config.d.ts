export type AppConfig = {
    apiBaseUrl?: string;
    publicAppUrl?: string;
    stripePublishableKey?: string;
    keycloak?: {
        url?: string;
        /**
         * Адрес админ-консоли Keycloak, если он не совпадает с url. В продакшене консоль наружу
         * закрыта (nginx отвечает 404 на /auth/admin) и открывается через SSH-туннель.
         */
        adminConsoleUrl?: string;
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
