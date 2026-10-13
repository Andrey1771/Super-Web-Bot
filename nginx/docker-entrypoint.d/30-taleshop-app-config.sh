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

# Тот же конфиг — прямо в index.html вместо <script src="/app-config.js">: отдельный файл грузился до всего сайта
# и не кэшировался (около 0,3 с лишнего ожидания на каждом заходе), а index.html и так всегда свежий.
# Собираем из нетронутой копии: при перезапуске контейнера конфиг (ключ Stripe и т.п.) мог поменяться.
html=/usr/share/nginx/html
orig=/usr/share/nginx/index.html.orig   # вне папки сайта, наружу не отдаётся
[ -f "$orig" ] || cp "$html/index.html" "$orig"
{ printf '<script>'; cat "$html/app-config.js"; printf '</script>'; } > /tmp/app-config.inline
awk -v tag='<script src="/app-config.js"></script>' -v f=/tmp/app-config.inline '
    BEGIN { while ((getline line < f) > 0) inline = inline line "\n" }
    { i = index($0, tag); if (i) $0 = substr($0, 1, i - 1) inline substr($0, i + length(tag)); print }
' "$orig" > "$html/index.html.tmp"
mv "$html/index.html.tmp" "$html/index.html"
rm -f /tmp/app-config.inline

# Теги <head> страницы — от сервера (nginx SSI → /__page-head → PageHeadService на бэкенде): у игры и статьи свои
# заголовок, описание и картинка ещё до JavaScript, иначе превью ссылок показывали «Tale Shop» у любой страницы.
# Общие <title> и description из сборки уходят в блок-заглушку: их nginx подставит, если сервер ответит пусто или с
# ошибкой. Метку ставим здесь, а не в public/index.html: минификатор сборки вырезает комментарии, а SSI — комментарии.
title='<title>Tale Shop</title>'
desc=$(grep -o '<meta name="description"[^>]*>' "$html/index.html" | head -n 1)
if [ -n "$desc" ] && grep -qF "$title" "$html/index.html"; then
    printf '%s' "$desc" > /tmp/page-head.desc
    printf '<!--# block name="page_head" -->%s%s<!--# endblock --><!--# include virtual="/__page-head" stub="page_head" -->' \
        "$desc" "$title" > /tmp/page-head.ssi
    awk -v t="$title" -v df=/tmp/page-head.desc -v sf=/tmp/page-head.ssi '
        BEGIN { getline d < df; getline s < sf }
        {
            i = index($0, d); if (i) $0 = substr($0, 1, i - 1) substr($0, i + length(d))
            i = index($0, t); if (i) $0 = substr($0, 1, i - 1) s substr($0, i + length(t))
            print
        }
    ' "$html/index.html" > "$html/index.html.tmp"
    mv "$html/index.html.tmp" "$html/index.html"
    rm -f /tmp/page-head.desc /tmp/page-head.ssi
else
    echo "taleshop: в index.html нет общих <title>/description — теги страниц от сервера не подключены" >&2
fi
