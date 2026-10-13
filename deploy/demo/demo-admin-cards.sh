#!/usr/bin/env bash
# Сохранённые тестовые карты демо-админа (Billing → Saved payment methods): Visa 4242 — основная, Mastercard 4444,
# Visa 3155 (3-D Secure). Привязываются от имени сервера через тестовый Stripe — сам демо-админ «только просмотр».
#
#   bash deploy/demo/demo-admin-cards.sh
#
# Повторный запуск безопасен: уже привязанные карты не дублируются (см. SuperBot.WebApi/Demo/DemoCardsCli.cs).
set -euo pipefail
export MSYS_NO_PATHCONV=1
. "$(dirname "$0")/../lib.sh"
REALM="${KEYCLOAK_REALM:-TaleShop}"

# Профиль биллинга на сайте ключуется по sub из Keycloak — берём его там же.
sub="$(docker compose exec -T -e REALM="$REALM" keycloak bash -c '
kc() { /opt/keycloak/bin/kcadm.sh "$@" </dev/null; }
kc config credentials --server http://localhost:8080/auth --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
kc get users -r "$REALM" -q username=demo-admin -q exact=true --fields id --format csv --noquotes' | tr -d '\r')"
[ -n "$sub" ] || { echo "demo-admin не найден в Keycloak (сначала deploy/demo/keycloak-demo-users.sh)." >&2; exit 1; }

docker compose run --rm --no-deps -T backend demo-cards "$sub" demo-admin@taleshop-demo.invalid
