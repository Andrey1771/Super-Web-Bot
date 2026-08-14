#!/usr/bin/env bash
# Прогоняет все демо-сиды по порядку. Запуск (из корня репозитория):
#   docker compose --profile demo run --rm demo-seeder
set -euo pipefail

# Строка реплика-сета, а не конкретный хост: праймари переизбирается после
# перезапусков, и хардкод любого mongoN рано или поздно ловит «not primary».
MONGO_URI="${MONGO_URI:-mongodb://mongo1:27017,mongo2:27017,mongo3:27017/SteamShopDatabase?replicaSet=rs0}"

# Порядок важен: контент (посты) раньше вовлечённости (просмотры, комментарии).
SCRIPTS=(
  seed-news
  seed-reviews
  seed-discounts
  seed-game-covers
  seed-engagement
  seed-comments
)

for name in "${SCRIPTS[@]}"; do
  echo "== ${name}"
  mongosh --quiet "$MONGO_URI" "/seeds/${name}.js"
done

echo "Demo seed complete."
