// Конфиг для локального запуска всего стека через docker-compose.
// Фронт отдаётся nginx на origin (http://localhost), API ходит туда же через прокси /api,
// а Keycloak поднят отдельным сервисом на порту 8088 (issuer токенов = http://localhost:8088).
const origin = window.location.origin;

window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: origin,
  publicAppUrl: origin,
  stripePublishableKey: "pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW",
  keycloak: {
    url: "http://localhost:8088/",
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: `${origin}/callback`,
    silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`,
    onLoad: "check-sso"
  }
};
