// Конфиг для локального запуска всего стека через docker-compose.
// Фронт отдаётся nginx на origin (http://localhost), API ходит туда же через прокси /api,
// а Keycloak поднят отдельным сервисом на порту 8088 (issuer токенов = http://localhost:8088).
const origin = window.location.origin;

window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: origin,
  publicAppUrl: origin,
  stripePublishableKey: "",
  keycloak: {
    url: "http://localhost:8088/",
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: `${origin}/callback`,
    silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`,
    onLoad: "check-sso"
  }
};
