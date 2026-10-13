#!/usr/bin/env bash
# Учётки зарегистрированных покупателей демо в Keycloak — по CSV из `backend demo-fill --print-buyers`
# (email,имя,фамилия,дата регистрации в мс). Обычно запускается из deploy/demo/fill-demo.sh.
#
#   bash deploy/demo/keycloak-demo-buyers.sh < buyers.csv
#   bash deploy/demo/keycloak-demo-buyers.sh --remove < buyers.csv   — удалить эти учётки
#
# Адреса выдуманные (@example.com), пароли — случайные и нигде не сохраняются: под этими учётками никто не входит,
# они нужны, чтобы покупатели в админке были настоящими зарегистрированными (профиль, дата регистрации, кэшбэк).
# Дата регистрации ставится прямо в базе Keycloak (через API её не задать) — и сбрасывается кэш пользователей.
# Повторный запуск безопасен: существующие учётки не трогаются, кроме даты.
set -euo pipefail
export MSYS_NO_PATHCONV=1
. "$(dirname "$0")/../lib.sh"
REALM="${KEYCLOAK_REALM:-TaleShop}"
MODE="${1:-create}"

buyers="$(grep -E '^[^,@ ]+@example\.com,' || true)"
[ -n "$buyers" ] || { echo "Нет строк покупателей на входе (ожидается CSV из demo-fill --print-buyers)." >&2; exit 1; }
echo "  покупателей в списке: $(printf '%s\n' "$buyers" | wc -l)"

printf '%s\n' "$buyers" | docker compose exec -T -e REALM="$REALM" -e MODE="$MODE" keycloak bash -c '
set -euo pipefail
# kcadm читает stdin — без </dev/null он съел бы оставшиеся строки списка.
kc() { /opt/keycloak/bin/kcadm.sh "$@" </dev/null; }
kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
made=0; removed=0
while IFS=, read -r email first last created; do
  id="$(kc get users -r "$REALM" -q email="$email" -q exact=true --fields id --format csv --noquotes || true)"
  if [ "$MODE" = "--remove" ]; then
    [ -n "$id" ] && kc delete "users/$id" -r "$REALM" && removed=$((removed + 1))
    continue
  fi
  if [ -z "$id" ]; then
    kc create users -r "$REALM" -s username="$email" -s email="$email" -s emailVerified=true -s enabled=true \
      -s firstName="$first" -s lastName="$last" >/dev/null
    kc set-password -r "$REALM" --username "$email" --new-password "$(head -c 24 /dev/urandom | base64 | tr -d "=+/")" >/dev/null
    made=$((made + 1))
  fi
done
echo "  Keycloak: создано $made, удалено $removed"
'

if [ "$MODE" != "--remove" ]; then
  # Дата регистрации — как у настоящих посетителей, а не «все сегодня».
  sql="$(printf '%s\n' "$buyers" | awk -F, '{printf "UPDATE user_entity SET created_timestamp=%s WHERE email=lower(%c%s%c);\n", $4, 39, $1, 39}')"
  printf '%s\n' "$sql" | docker compose exec -T keycloak-db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
  docker compose exec -T -e REALM="$REALM" keycloak bash -c '
kc() { /opt/keycloak/bin/kcadm.sh "$@" </dev/null; }
kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
kc create "realms/$REALM/clear-user-cache" >/dev/null'
  echo "  даты регистрации проставлены"
fi
