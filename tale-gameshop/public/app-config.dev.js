window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: "https://localhost:7002",
  publicAppUrl: "http://localhost:3000",
  stripePublishableKey: "pk_test_51PYcsW2NLq3ZGHldXb1IU6dygsBlIXn9jw2jXaFCisQOE5RBfmvVF0phul3EDhFE8RPxgdLrd6K3s5lasn0l7Aqt00E0IpEiZW",
  keycloak: {
    // Keycloak из docker-стенда, через его nginx: http://localhost/auth (issuer токенов тот же).
    url: "http://localhost/auth/",
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: "http://localhost:3000/callback",
    silentCheckSsoRedirectUri: "http://localhost:3000/silent-check-sso.html",
    onLoad: "check-sso"
  }
};
