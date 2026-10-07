#!/usr/bin/env bash
# Первый выпуск сертификата Let's Encrypt для DOMAIN из .env. Продлевает его потом сервис certbot.
# Перед запуском: DNS-запись домена указывает на сервер, порты 80 и 443 открыты, стек запущен
# (nginx пока отдаёт временный самоподписанный сертификат).
#   ./deploy/issue-cert.sh            — настоящий сертификат
#   ./deploy/issue-cert.sh --staging  — тестовый: проверить настройку, не тратя лимит Let's Encrypt
set -euo pipefail
. "$(dirname "$0")/lib.sh"

domain="$(env_value DOMAIN)"
email="$(env_value LETSENCRYPT_EMAIL)"
if [ -z "$domain" ] || [ -z "$email" ]; then
    echo "В .env нужны DOMAIN и LETSENCRYPT_EMAIL (на него Let's Encrypt пишет о проблемах с сертификатом)" >&2
    exit 1
fi

extra=()
if [ "${1:-}" = "--staging" ]; then
    extra+=(--staging)
fi

docker compose run --rm --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot -d "$domain" \
    --email "$email" --agree-tos --no-eff-email --non-interactive \
    ${extra[@]+"${extra[@]}"}

docker compose exec nginx taleshop-reload
