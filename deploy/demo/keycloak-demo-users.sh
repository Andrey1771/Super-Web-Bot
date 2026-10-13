#!/usr/bin/env bash
# Демо-сайт (портфолио) в Keycloak: общий демо-админ «только просмотр» и открытая регистрация посетителей.
#
#   bash deploy/demo/keycloak-demo-users.sh
#
# Пароль — DEMO_ADMIN_PASSWORD из .env (его же показывает сайт в окне приглашения, он публичный намеренно).
# Повторный запуск безопасен: заводит недостающее и выставляет пароль заново.
#
# Почему так:
#  - посетители регистрируют свои аккаунты и покупают тестовой картой, поэтому регистрация и «Забыли пароль?»
#    открыты (письма уходят по SMTP из .env — см. deploy/keycloak-smtp.sh). Почту нужно подтвердить: письмо уходит
#    сразу при регистрации, ссылка в нём живёт сутки (по умолчанию Keycloak — 5 минут, письмо часто открывают позже);
#  - demo-admin общий для всех, поэтому собственной страницы аккаунта Keycloak у него нет
#    (без ролей клиента account — ни просмотра, ни правок; IP и устройства других посетителей оттуда не видны);
#    в самом сайте его правки закрывает DemoGuard, почта у него на несуществующем домене .invalid;
#  - общий demo-buyer больше не нужен — отключается (не удаляется), если остался от прежней версии демо.
#  DEMO_OPEN_REALM=false — настройки realm не трогать (так скрипт проверяют на стенде разработчика).
set -euo pipefail
export MSYS_NO_PATHCONV=1

# .env не исполняется шеллом (пароли со спецсимволами): значения читает env_value из deploy/lib.sh.
. "$(dirname "$0")/../lib.sh"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-$(env_value DEMO_ADMIN_PASSWORD)}"
: "${DEMO_ADMIN_PASSWORD:?задайте DEMO_ADMIN_PASSWORD в .env}"
REALM="${KEYCLOAK_REALM:-TaleShop}"

# Всё выполняется внутри контейнера Keycloak: учётка администратора берётся из его окружения и не печатается.
docker compose exec -T \
  -e DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" \
  -e REALM="$REALM" \
  -e DEMO_OPEN_REALM="${DEMO_OPEN_REALM:-true}" \
  keycloak bash -s <<'IN_CONTAINER'
set -euo pipefail
kc=/opt/keycloak/bin/kcadm.sh
$kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

if [ "$DEMO_OPEN_REALM" = true ]; then
  $kc update "realms/$REALM" -s registrationAllowed=true -s resetPasswordAllowed=true -s verifyEmail=true \
    -s "attributes.\"actionTokenGeneratedByUserLifespan.verify-email\"=86400"
  echo "  регистрация и «Забыли пароль?» открыты, почта подтверждается письмом"
fi

user_id() {
  $kc get users -r "$REALM" -q username="$1" -q exact=true --fields id --format csv --noquotes
}

if [ -z "$(user_id demo-admin)" ]; then
  $kc create users -r "$REALM" -s username=demo-admin -s email=demo-admin@taleshop-demo.invalid -s emailVerified=true \
    -s enabled=true -s firstName=Demo -s lastName=Admin >/dev/null
fi
id="$(user_id demo-admin)"
$kc update "users/$id" -r "$REALM" -s 'requiredActions=[]' -s emailVerified=true -s enabled=true
$kc set-password -r "$REALM" --username demo-admin --new-password "$DEMO_ADMIN_PASSWORD"
# Роль по умолчанию даёт manage-account (смена пароля и 2FA на странице Keycloak) — у общего аккаунта её нет.
$kc remove-roles -r "$REALM" --uusername demo-admin --rolename "default-roles-$(echo "$REALM" | tr '[:upper:]' '[:lower:]')" 2>/dev/null || true
# И страницы аккаунта Keycloak у него нет совсем: даже view-profile отдаёт в API аккаунта его сеансы и устройства с IP —
# а это сеансы всех, кто входил под общей учёткой. Сайту роль не нужна: «Безопасность» берёт данные через свой сервер.
$kc remove-roles -r "$REALM" --uusername demo-admin --cclientid account --rolename view-profile 2>/dev/null || true
$kc remove-roles -r "$REALM" --uusername demo-admin --cclientid account --rolename manage-account 2>/dev/null || true
$kc add-roles -r "$REALM" --uusername demo-admin --rolename admin
echo "  demo-admin — готов (только просмотр)"

if buyer="$(user_id demo-buyer)" && [ -n "$buyer" ]; then
  $kc update "users/$buyer" -r "$REALM" -s enabled=false
  echo "  demo-buyer — отключён"
fi
IN_CONTAINER
echo "Демо в Keycloak готово."
