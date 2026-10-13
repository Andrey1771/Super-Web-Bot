#!/usr/bin/env bash
# Прогоняет все демо-сиды по порядку. Запуск (из корня репозитория):
#   docker compose --profile demo run --rm -e ALLOW_DEMO_SEED=1 demo-seeder
set -euo pipefail

# Сиды пишут выдуманные отзывы, заказы, закупочные цены и команду, а seed-discounts стирает
# все скидки. На боевой базе это порча данных, поэтому без явного согласия не запускаемся.
# Флаг намеренно не прописан в docker-compose.yml: его нужно передать руками при каждом запуске.
if [[ "${ALLOW_DEMO_SEED:-}" != "1" ]]; then
  echo "Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1." >&2
  echo "Это для локального стенда. Запуск: docker compose --profile demo run --rm -e ALLOW_DEMO_SEED=1 demo-seeder" >&2
  exit 1
fi

# Строка реплика-сета, а не конкретный хост: праймари переизбирается после
# перезапусков, и хардкод любого mongoN рано или поздно ловит «not primary».
MONGO_URI="${MONGO_URI:-mongodb://mongo1:27017,mongo2:27017,mongo3:27017/SteamShopDatabase?replicaSet=rs0}"

# Порядок важен: контент (посты) раньше вовлечённости (просмотры, комментарии).
# Витринная игра — первой: seed-reviews и seed-discounts идут по всем играм каталога,
# и она должна попасть в их выборку, иначе останется без отзывов и рейтинга.
# seed-software — после seed-game-covers: тот переписывает imagePath всем товарам.
# seed-upcoming-games — после отзывов, скидок и заказов: у невышедших игр не бывает ни того, ни другого.
SCRIPTS=(
  seed-showcase-game
  seed-news
  seed-reviews
  seed-discounts
  seed-game-covers
  seed-software
  seed-key-costs
  seed-orders
  seed-upcoming-games
  seed-engagement
  seed-comments
  seed-team
)

for name in "${SCRIPTS[@]}"; do
  echo "== ${name}"
  mongosh --quiet "$MONGO_URI" "/seeds/${name}.js"
done

echo "Demo seed complete."
# Настройки сайта (команда на «О нас») backend держит в памяти — запись мимо него он не видит.
echo "Restart the backend so it re-reads site settings: docker compose restart backend"
