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
