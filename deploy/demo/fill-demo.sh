#!/usr/bin/env bash
# Наполнить демо статистикой за последние недели (см. SuperBot.WebApi/Demo/DemoFillCli.cs): покупатели в Keycloak,
# заказы через тестовый Stripe, воронка, корзины, рассылка, поддержка, модерация, неудачные платежи, расходы на рекламу.
#
#   bash deploy/demo/fill-demo.sh [заказов, 180] [дней, 60]
#   bash deploy/demo/fill-demo.sh --reset        — убрать всё наполненное, кроме заказов (и учётки покупателей)
#
# Нужен уже выполненный demo-seed (промокоды, распродажи) и тестовый ключ Stripe. Письма не отправляются (Mail__DryRun).
set -euo pipefail
. "$(dirname "$0")/../lib.sh"

buyers="$(docker compose run --rm --no-deps -T backend demo-fill --print-buyers | grep -E '^[^,@ ]+@example\.com,' || true)"
[ -n "$buyers" ] || { echo "demo-fill --print-buyers ничего не вернул." >&2; exit 1; }

if [ "${1:-}" = "--reset" ]; then
    docker compose run --rm --no-deps -T backend demo-fill --reset
    printf '%s\n' "$buyers" | bash "$(dirname "$0")/keycloak-demo-buyers.sh" --remove
    exit 0
fi

echo "1/2 Покупатели в Keycloak"
printf '%s\n' "$buyers" | bash "$(dirname "$0")/keycloak-demo-buyers.sh"
echo "2/2 Заказы и статистика (несколько минут: каждый заказ — тестовый платёж Stripe)"
docker compose run --rm --no-deps -T -e Mail__DryRun=true backend demo-fill "$@"
