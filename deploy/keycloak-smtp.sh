#!/usr/bin/env bash
# Почта Keycloak (подтверждение адреса, «Забыли пароль?», настройка 2FA) — тот же SMTP, что у сайта (SMTP_* из .env).
#
#   bash deploy/keycloak-smtp.sh
#
# Нужен на уже работающем Keycloak: настройки из keycloak/import/TaleShop-realm.json применяются только при самом
# первом импорте realm. Порт 465 — шифрование сразу (SSL; так принимает Cloudflare Email Sending), иначе STARTTLS
# по SMTP_USE_TLS. Пароль SMTP передаётся в контейнер через окружение и не печатается.
set -euo pipefail
export MSYS_NO_PATHCONV=1

. "$(dirname "$0")/lib.sh"
host="$(env_value SMTP_HOST)"; port="$(env_value SMTP_PORT)"
user="$(env_value SMTP_USERNAME)"; password="$(env_value SMTP_PASSWORD)"
from="$(env_value MAIL_FROM)"; tls="$(env_value SMTP_USE_TLS)"
: "${host:?задайте SMTP_HOST в .env}"; : "${port:?задайте SMTP_PORT в .env}"; : "${from:?задайте MAIL_FROM в .env}"
ssl=false; starttls="${tls:-false}"
if [ "$port" = 465 ]; then ssl=true; starttls=false; fi
auth=false; [ -n "$user" ] && auth=true

docker compose exec -T \
  -e REALM="${KEYCLOAK_REALM:-TaleShop}" \
  -e SMTP_HOST_="$host" -e SMTP_PORT_="$port" -e SMTP_FROM_="$from" -e SMTP_SSL_="$ssl" -e SMTP_STARTTLS_="$starttls" \
  -e SMTP_AUTH_="$auth" -e SMTP_USER_="$user" -e SMTP_PASSWORD_="$password" \
  keycloak bash -s <<'IN_CONTAINER'
set -euo pipefail
kc=/opt/keycloak/bin/kcadm.sh
$kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
$kc update "realms/$REALM" \
  -s "smtpServer.host=$SMTP_HOST_" -s "smtpServer.port=$SMTP_PORT_" -s "smtpServer.from=$SMTP_FROM_" \
  -s "smtpServer.fromDisplayName=Tale Shop" -s "smtpServer.ssl=$SMTP_SSL_" -s "smtpServer.starttls=$SMTP_STARTTLS_" \
  -s "smtpServer.auth=$SMTP_AUTH_" -s "smtpServer.user=$SMTP_USER_" -s "smtpServer.password=$SMTP_PASSWORD_"
echo "  SMTP $SMTP_HOST_:$SMTP_PORT_ (ssl=$SMTP_SSL_, starttls=$SMTP_STARTTLS_), от $SMTP_FROM_"
IN_CONTAINER
echo "Почта Keycloak настроена."
