// Конфиг собранного фронта. В docker-образе nginx этот файл при старте контейнера заменяется
// сгенерированным из переменных окружения (nginx/docker-entrypoint.d/30-taleshop-app-config.sh) —
// там же ключ Stripe. Здесь — то, что останется, если отдать сборку без этого скрипта.
// Keycloak — на том же домене под /auth (его проксирует nginx).
const origin = window.location.origin;

window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: origin,
  publicAppUrl: origin,
  stripePublishableKey: "",
  keycloak: {
    url: `${origin}/auth/`,
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: `${origin}/callback`,
    silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`,
    onLoad: "check-sso"
  }
};
