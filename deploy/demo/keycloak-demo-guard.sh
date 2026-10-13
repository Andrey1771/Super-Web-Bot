#!/usr/bin/env bash
# Сторож общего демо-админа: раз в минуту возвращает его учётку в исходный вид.
#
#   bash deploy/demo/keycloak-demo-guard.sh            — один проход (из корня репозитория на сервере)
#   bash deploy/demo/keycloak-demo-guard.sh --install  — поставить в cron (/etc/cron.d/taleshop-demo-guard)
#
# Зачем: demo-admin — общая учётка с публичным паролем. Сайт и страница аккаунта Keycloak ему правки не дают, но
# настройка 2FA, резервных кодов и смена пароля открываются и ссылкой в обход кнопок (kc_action=CONFIGURE_TOTP и т. п.),
# а роль «только просмотр» этот путь не закрывает. Один посетитель включил бы 2FA или сменил пароль — и все остальные
# остались бы снаружи. Сторож за минуту это откатывает:
#   - удаляет у demo-admin все способы входа, кроме пароля (OTP, резервные коды, ключи доступа);
#   - снимает обязательные действия и включает учётку, если её выключили;
#   - если пароль сменили (у учётных данных пароля новая дата), ставит снова DEMO_ADMIN_PASSWORD из .env.
# Обращается к API Keycloak curl'ом по внутренней сети Docker, а не kcadm: тот поднимал бы Java в контейнере Keycloak
# каждую минуту. Пароли и токен в командную строку не попадают. Пишет в журнал только когда что-то откатил.
set -euo pipefail

# shellcheck source=../lib.sh
. "$(dirname "$0")/../lib.sh"

if [ "${1:-}" = "--install" ]; then
    cat > /etc/cron.d/taleshop-demo-guard <<CRON
# Сторож демо-админа Tale Shop: см. deploy/demo/keycloak-demo-guard.sh
* * * * * root cd $(pwd) && bash deploy/demo/keycloak-demo-guard.sh >> /var/log/taleshop-demo-guard.log 2>&1
CRON
    chmod 644 /etc/cron.d/taleshop-demo-guard
    echo "Установлено: /etc/cron.d/taleshop-demo-guard (раз в минуту), журнал /var/log/taleshop-demo-guard.log"
    exit 0
fi

REALM="${KEYCLOAK_REALM:-TaleShop}"
DEMO_USER=demo-admin
STATE_DIR=/var/lib/taleshop
STATE_FILE="$STATE_DIR/demo-admin-password-created"
ADMIN_USER="$(env_value KEYCLOAK_ADMIN)"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="$(env_value KEYCLOAK_ADMIN_PASSWORD)"
DEMO_PASS="$(env_value DEMO_ADMIN_PASSWORD)"
[ -n "$ADMIN_PASS" ] && [ -n "$DEMO_PASS" ] || { echo "$(date -Is) нет KEYCLOAK_ADMIN_PASSWORD или DEMO_ADMIN_PASSWORD в .env" >&2; exit 1; }

log() { echo "$(date -Is) $*"; }

# Keycloak не запущен (перезапуск, обновление) — тихо ждём следующей минуты.
cid="$(docker compose ps -q keycloak 2>/dev/null || true)"
[ -n "$cid" ] || exit 0
ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$cid" | awk '{print $1}')"
[ -n "$ip" ] || exit 0
base="http://$ip:8080/auth"

body="$(jq -rn --arg u "$ADMIN_USER" --arg p "$ADMIN_PASS" \
    '"grant_type=password&client_id=admin-cli&username=\($u|@uri)&password=\($p|@uri)"')"
token="$(printf '%s' "$body" | curl -sf --max-time 15 --data @- "$base/realms/master/protocol/openid-connect/token" | jq -r '.access_token // empty')" || exit 0
[ -n "$token" ] || exit 0

# Токен — заголовком из файла-дескриптора, чтобы он не светился в списке процессов.
api() {
    local method="$1" path="$2"
    shift 2
    curl -sf --max-time 15 -X "$method" -H @<(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$token") \
        "$base/admin/realms/$REALM$path" "$@"
}

uid="$(api GET "/users?username=$DEMO_USER&exact=true" | jq -r '.[0].id // empty')"
[ -n "$uid" ] || exit 0

# Всё, кроме пароля: OTP, резервные коды, ключи доступа (WebAuthn).
creds="$(api GET "/users/$uid/credentials")"
for cred in $(printf '%s' "$creds" | jq -r '.[] | select(.type != "password") | "\(.id):\(.type)"'); do
    api DELETE "/users/$uid/credentials/${cred%%:*}" >/dev/null
    log "удалён способ входа ${cred#*:} у $DEMO_USER"
done

user="$(api GET "/users/$uid")"
if [ "$(printf '%s' "$user" | jq -r '(.requiredActions | length) > 0 or (.enabled | not)')" = true ]; then
    api PUT "/users/$uid" --data '{"requiredActions":[],"enabled":true}' >/dev/null
    log "сняты обязательные действия / учётка включена: $(printf '%s' "$user" | jq -c '{requiredActions, enabled}')"
fi

# Пароль: сравниваем дату создания его учётных данных с запомненной. Первый проход только запоминает.
mkdir -p "$STATE_DIR"
created="$(printf '%s' "$creds" | jq -r '[.[] | select(.type == "password")][0].createdDate // empty')"
known="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ -z "$known" ] && [ -n "$created" ]; then
    printf '%s' "$created" > "$STATE_FILE"
elif [ -z "$created" ] || [ "$created" != "$known" ]; then
    jq -n --arg p "$DEMO_PASS" '{type: "password", value: $p, temporary: false}' \
        | api PUT "/users/$uid/reset-password" --data @- >/dev/null
    api GET "/users/$uid/credentials" | jq -r '[.[] | select(.type == "password")][0].createdDate // empty' > "$STATE_FILE"
    log "пароль $DEMO_USER возвращён к DEMO_ADMIN_PASSWORD"
fi
