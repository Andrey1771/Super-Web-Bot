window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: "http://localhost:7002",
  keycloak: {
    url: "http://localhost:8088/",
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: "http://localhost:3000/callback",
    silentCheckSsoRedirectUri: "http://localhost:3000/silent-check-sso.html",
    onLoad: "check-sso"
  }
};
