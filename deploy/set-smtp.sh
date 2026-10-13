#!/usr/bin/env bash
# Ставит в .env почтовый сервис для отправки писем (по умолчанию — Resend) и спрашивает пароль/ключ, не показывая его:
#
#   bash deploy/set-smtp.sh                       — Resend: smtp.resend.com:465, логин resend, отправитель no-reply@tale-shop.com
#   SMTP_HOST=… SMTP_USERNAME=… MAIL_FROM=… bash deploy/set-smtp.sh   — другой сервис
#
# С компьютера, одной командой без кавычек (PowerShell портит вложенные кавычки):
#   ssh -t -i ~/.ssh/neuropulse_vps -p 2222 root@<сервер> bash /opt/taleshop/deploy/set-smtp.sh
#
# Старый .env сохраняется рядом копией .env.bak-<время>. Потом: docker compose up -d --no-deps --force-recreate backend
# и bash deploy/keycloak-smtp.sh (почта Keycloak для «Забыли пароль?»).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

HOST="${SMTP_HOST:-smtp.resend.com}"
PORT="${SMTP_PORT:-465}"
USERNAME="${SMTP_USERNAME:-resend}"
FROM="${MAIL_FROM:-no-reply@tale-shop.com}"

read -rsp "Пароль SMTP / API-ключ (${HOST}): " SECRET
echo
[ -n "$SECRET" ] || { echo "Пусто — ничего не меняю." >&2; exit 1; }

backup=".env.bak-$(date +%Y%m%d-%H%M%S)"
cp .env "$backup"
chmod 600 "$backup"
sed -i '/^SMTP_HOST=/d;/^SMTP_PORT=/d;/^SMTP_SSL=/d;/^SMTP_USE_TLS=/d;/^SMTP_USERNAME=/d;/^SMTP_PASSWORD=/d;/^MAIL_FROM=/d' .env
# Порт 465 — шифрование сразу (SMTPS), иначе — STARTTLS.
if [ "$PORT" = 465 ]; then ssl=true; tls=false; else ssl=false; tls=true; fi
printf 'SMTP_HOST=%s\nSMTP_PORT=%s\nSMTP_SSL=%s\nSMTP_USE_TLS=%s\nSMTP_USERNAME=%s\nSMTP_PASSWORD=%s\nMAIL_FROM=%s\n' \
    "$HOST" "$PORT" "$ssl" "$tls" "$USERNAME" "$SECRET" "$FROM" >> .env
unset SECRET
echo "Готово: почта — $HOST:$PORT, отправитель $FROM. Старый .env — $backup"
