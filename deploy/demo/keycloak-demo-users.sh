#!/usr/bin/env bash
# Демо-аккаунты Keycloak для демо-сайта (портфолио): demo-admin (роль admin) и demo-buyer.
#
#   bash deploy/demo/keycloak-demo-users.sh
#
# Пароли — DEMO_ADMIN_PASSWORD и DEMO_BUYER_PASSWORD из .env (их же показывает сайт на странице приглашения,
# они публичные намеренно). Повторный запуск безопасен: заводит недостающее и выставляет пароли заново.
#
# Почему так:
#  - аккаунты общие для всех посетителей, поэтому собственная страница аккаунта Keycloak у них только для чтения
#    (вместо роли по умолчанию — одна account/view-profile): сменить пароль или включить 2FA оттуда нельзя;
#    то же в самом сайте закрывает DemoGuard;
#  - почта на несуществующем домене .invalid: «Забыли пароль» для них никуда не придёт;
#  - в демо-realm выключены регистрация и восстановление пароля — входят только демо-аккаунтами
#    (DEMO_LOCK_REALM=false — realm не трогать: так скрипт проверяют на стенде разработчика).
set -euo pipefail
export MSYS_NO_PATHCONV=1

# .env не исполняется шеллом (пароли со спецсимволами): значения читает env_value из deploy/lib.sh.
. "$(dirname "$0")/../lib.sh"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-$(env_value DEMO_ADMIN_PASSWORD)}"
DEMO_BUYER_PASSWORD="${DEMO_BUYER_PASSWORD:-$(env_value DEMO_BUYER_PASSWORD)}"
: "${DEMO_ADMIN_PASSWORD:?задайте DEMO_ADMIN_PASSWORD в .env}"
: "${DEMO_BUYER_PASSWORD:?задайте DEMO_BUYER_PASSWORD в .env}"
REALM="${KEYCLOAK_REALM:-TaleShop}"

# Всё выполняется внутри контейнера Keycloak: учётка администратора берётся из его окружения и не печатается.
docker compose exec -T \
  -e DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" \
  -e DEMO_BUYER_PASSWORD="$DEMO_BUYER_PASSWORD" \
  -e REALM="$REALM" \
  -e DEMO_LOCK_REALM="${DEMO_LOCK_REALM:-true}" \
  keycloak bash -s <<'IN_CONTAINER'
set -euo pipefail
kc=/opt/keycloak/bin/kcadm.sh
$kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

if [ "$DEMO_LOCK_REALM" = true ]; then
  $kc update "realms/$REALM" -s registrationAllowed=false -s resetPasswordAllowed=false
fi

demo_user() {
  local username="$1" email="$2" first="$3" last="$4" password="$5" role="$6"
  if [ -z "$($kc get users -r "$REALM" -q username="$username" -q exact=true --fields id --format csv --noquotes)" ]; then
    $kc create users -r "$REALM" -s username="$username" -s email="$email" -s emailVerified=true \
      -s enabled=true -s firstName="$first" -s lastName="$last" >/dev/null
  fi
  local id
  id="$($kc get users -r "$REALM" -q username="$username" -q exact=true --fields id --format csv --noquotes)"
  $kc update "users/$id" -r "$REALM" -s 'requiredActions=[]' -s emailVerified=true -s enabled=true
  $kc set-password -r "$REALM" --username "$username" --new-password "$password"
  # Роль по умолчанию даёт manage-account (смена пароля и 2FA на странице Keycloak) — у общих аккаунтов её нет.
  $kc remove-roles -r "$REALM" --uusername "$username" --rolename "default-roles-$(echo "$REALM" | tr '[:upper:]' '[:lower:]')" 2>/dev/null || true
  $kc add-roles -r "$REALM" --uusername "$username" --cclientid account --rolename view-profile
  if [ -n "$role" ]; then
    $kc add-roles -r "$REALM" --uusername "$username" --rolename "$role"
  fi
  echo "  $username — готов"
}

demo_user demo-admin demo-admin@taleshop-demo.invalid Demo Admin "$DEMO_ADMIN_PASSWORD" admin
demo_user demo-buyer demo-buyer@taleshop-demo.invalid Demo Buyer "$DEMO_BUYER_PASSWORD" ""
IN_CONTAINER
echo "Демо-аккаунты Keycloak готовы."
