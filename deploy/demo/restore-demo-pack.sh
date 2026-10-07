#!/usr/bin/env bash
# Разворачивает пакет демо (deploy/demo/build-demo-pack.sh) на демо-сервере — первая установка и обновление каталога.
#
#   bash deploy/demo/restore-demo-pack.sh /путь/к/demo-pack
#
# В папке — db.archive.gz (база-шаблон) и uploads.tar (медиа). Что делает:
#  1. останавливает бэкенд и бота (чтобы никто не писал в базу во время замены);
#  2. заменяет базу-шаблон ($MONGO_DB) содержимым пакета;
#  3. удаляет все песочницы посетителей и запасные копии — они собраны из старого шаблона;
#  4. распаковывает медиа в том uploads (поверх: файлы с теми же именами — те же файлы);
#  5. запускает бэкенд и бота; запасные копии бэкенд соберёт сам за минуту.
# Демо-аккаунты Keycloak — отдельно: deploy/demo/keycloak-demo-users.sh.
set -euo pipefail

PACK="$(cd "${1:?укажите папку пакета демо}" && pwd)"
# .env не исполняется шеллом (пароли со спецсимволами): значения читает env_value из deploy/lib.sh.
. "$(dirname "$0")/../lib.sh"
[ -f "$PACK/db.archive.gz" ] && [ -f "$PACK/uploads.tar" ] || { echo "В $PACK нет db.archive.gz и uploads.tar" >&2; exit 1; }
DEMO_DB="$(env_value MONGO_DB)"; DEMO_DB="${DEMO_DB:-TaleShopDemo}"
PREFIX="${DEMO_SANDBOX_PREFIX:-tsdemo_}"

echo "1/5 останавливаю бэкенд и бота"
docker compose stop backend bot

echo "2/5 база-шаблон $DEMO_DB из пакета"
docker compose cp "$PACK/db.archive.gz" mongo1:/tmp/demo-db.archive.gz
docker compose exec -T mongo1 sh -c "mongorestore --quiet -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" \
  --authenticationDatabase admin --drop --gzip --archive=/tmp/demo-db.archive.gz \
  --nsFrom='TaleShopDemo.*' --nsTo='$DEMO_DB.*' && rm /tmp/demo-db.archive.gz"

echo "3/5 удаляю песочницы старого шаблона"
# Логин администратора Mongo берётся из окружения контейнера mongo1 — здесь он не нужен и не печатается.
docker compose exec -T -e PREFIX="$PREFIX" -e DEMO_DB="$DEMO_DB" mongo1 sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "
  const prefix = process.env.PREFIX, demoDb = process.env.DEMO_DB;
  const names = db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map(d => d.name).filter(n => n.indexOf(prefix) === 0);
  names.forEach(n => db.getSiblingDB(n).dropDatabase());
  [\"DemoSandboxes\", \"DemoMailbox\", \"DemoPayments\"].forEach(c => db.getSiblingDB(demoDb).getCollection(c).drop());
  print(\"песочниц удалено: \" + names.length);"'

echo "4/5 медиа в том uploads"
# Тем же образом и пользователем, что пишет бэкенд: права на файлы — как у загруженных им самим.
docker compose run --rm --no-deps -T -v "$PACK:/pack:ro" --entrypoint sh backend -c \
  'tar -xf /pack/uploads.tar -C /app/wwwroot/uploads && du -sh /app/wwwroot/uploads | cut -f1'

echo "5/5 запускаю бэкенд и бота"
docker compose up -d --no-deps backend bot
echo "Готово. Каталог демо обновлён; запасные копии песочниц соберутся в течение минуты."
