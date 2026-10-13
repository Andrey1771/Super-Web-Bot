#!/bin/sh
# Демо-сайт для портфолио (TALESHOP_DEMO=true): поисковикам его не показываем. robots.txt в демо отдаёт бэкенд
# («Disallow: /»), а этот заголовок закрывает ещё и страницы, на которые кто-то сошлётся напрямую.
# Заголовок добавляется в общий набор защитных заголовков — он подключён в каждой location.
set -eu

[ "${TALESHOP_DEMO:-false}" = "true" ] || exit 0

headers=/etc/nginx/security-headers.conf
if ! grep -q 'X-Robots-Tag' "$headers"; then
    printf '\n# Демо-сайт: не индексировать (35-taleshop-demo.sh).\nadd_header X-Robots-Tag "noindex, nofollow" always;\n' >> "$headers"
fi
echo "taleshop: демо-режим — страницы закрыты от поисковиков (X-Robots-Tag)"

# Демо работает на конфиге стенда (NGINX_SITE=dev, TLS у системного nginx сервера), а там админ-консоль Keycloak
# открыта. Закрываем её, как в продакшене: консоль и вход в realm master — только через SSH-туннель
# (ssh -L 8088:127.0.0.1:8088 сервер → http://localhost:8088/auth/admin).
mkdir -p /etc/nginx/site-extra
cat > /etc/nginx/site-extra/admin-lock.conf <<'CONF'
# Демо-сайт: админ-консоль Keycloak наружу закрыта (35-taleshop-demo.sh).
location ^~ /auth/admin/ { return 404; }
location ^~ /auth/realms/master/ { return 404; }
CONF
echo "taleshop: демо-режим — админ-консоль Keycloak закрыта (только SSH-туннель)"
