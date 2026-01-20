const origin = window.location.origin;

window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: origin,
  keycloak: {
    url: origin,
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: `${origin}/callback`,
    silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`,
    onLoad: "check-sso"
  }
};
