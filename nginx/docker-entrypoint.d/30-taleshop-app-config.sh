#!/bin/sh
# Пишет /app-config.js — рантайм-конфиг фронта — из переменных окружения контейнера. Один и тот же
# образ работает и на стенде, и в продакшене: различаются только переменные, сборка не нужна.
set -eu

key="${STRIPE_PUBLISHABLE_KEY:-}"
# Значение попадает в JavaScript как есть, поэтому — только формат ключа Stripe.
case "$key" in
    "") echo "taleshop: STRIPE_PUBLISHABLE_KEY не задан — оплата картой на сайте будет недоступна" >&2 ;;
    pk_test_*|pk_live_*)
        if printf '%s' "$key" | grep -q '[^A-Za-z0-9_]'; then
            echo "taleshop: STRIPE_PUBLISHABLE_KEY содержит недопустимые символы" >&2
            exit 1
        fi ;;
    *) echo "taleshop: STRIPE_PUBLISHABLE_KEY должен начинаться с pk_test_ или pk_live_" >&2; exit 1 ;;
esac

# Отдельный адрес админ-консоли Keycloak (в продакшене — SSH-туннель). Пусто — та же /auth.
admin_url="${KEYCLOAK_ADMIN_CONSOLE_URL:-}"
if printf '%s' "$admin_url" | grep -q '["\<>]'; then
    echo "taleshop: KEYCLOAK_ADMIN_CONSOLE_URL содержит недопустимые символы" >&2
    exit 1
fi

cat > /usr/share/nginx/html/app-config.js <<JS
// Сгенерирован при старте контейнера nginx (docker-entrypoint.d/30-taleshop-app-config.sh).
const origin = window.location.origin;

window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: origin,
  publicAppUrl: origin,
  stripePublishableKey: "${key}",
  keycloak: {
    url: \`\${origin}/auth/\`,
    adminConsoleUrl: "${admin_url}",
    realm: "TaleShop",
    clientId: "tale-shop-app",
    redirectUri: \`\${origin}/callback\`,
    silentCheckSsoRedirectUri: \`\${origin}/silent-check-sso.html\`,
    onLoad: "check-sso"
  }
};
JS
