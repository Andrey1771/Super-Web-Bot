#!/usr/bin/env bash
# Сборка пакета демо-сайта на стенде разработчика (Git Bash / Linux, запущенный docker compose стенда).
#
#   bash deploy/demo/build-demo-pack.sh [папка, по умолчанию demo-pack]
#
# 1. Копирует базу стенда в базу TaleShopDemo (база стенда не меняется).
# 2. Оставляет в копии только каталог из deploy/demo/catalog.json и настройки, убирает всё пользовательское
#    (deploy/demo/build-demo-db.js), заводит демо-ключи (backend demo-keys — образ бэкенда должен быть свежим).
# 3. Кладёт в папку: db.archive.gz — архив демо-базы, uploads.tar — только те медиа, на которые она ссылается.
# На сервере пакет разворачивает deploy/demo/restore-demo-pack.sh.
set -euo pipefail
export MSYS_NO_PATHCONV=1

# docker.exe под Git Bash не понимает пути вида /c/...: берём C:/... (pwd -W), на Linux — обычный.
winpath() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }
ROOT="$(winpath "$(dirname "$0")/../..")"
mkdir -p "${1:-$ROOT/demo-pack}"
OUT="$(winpath "${1:-$ROOT/demo-pack}")"
SOURCE_DB="${MONGO_DB:-SteamShopDatabase}"
DEMO_DB="TaleShopDemo"
VOLUME="${UPLOADS_VOLUME:-super-web-bot_uploads_data}"

# Писать можно только в текущий primary реплики стенда.
PRIMARY=""
for n in mongo1 mongo2 mongo3; do
  c="super-web-bot-$n-1"
  if docker exec "$c" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q true; then PRIMARY="$c"; break; fi
done
[ -n "$PRIMARY" ] || { echo "Не нашёл primary среди mongo1..3 — стенд запущен?" >&2; exit 1; }
echo "primary: $PRIMARY"

echo "1/4 копия базы $SOURCE_DB → $DEMO_DB"
docker exec "$PRIMARY" sh -c "mongodump --quiet --db '$SOURCE_DB' --archive=/tmp/demo-src.archive && \
  mongorestore --quiet --drop --archive=/tmp/demo-src.archive --nsFrom='$SOURCE_DB.*' --nsTo='$DEMO_DB.*' && rm /tmp/demo-src.archive"

echo "2/4 чистка демо-базы по каталогу"
docker cp "$ROOT/deploy/demo/catalog.json" "$PRIMARY:/tmp/demo-catalog.json"
docker cp "$ROOT/deploy/demo/build-demo-db.js" "$PRIMARY:/tmp/build-demo-db.js"
docker cp "$ROOT/deploy/demo/translations.json" "$PRIMARY:/tmp/demo-translations.json"
docker exec "$PRIMARY" mongosh --quiet "$DEMO_DB" --file /tmp/build-demo-db.js > "$OUT/build.log"
grep -v '^FILES_JSON ' "$OUT/build.log"

# Ролик HLS — это плейлист и папка сегментов: по ссылке на master.m3u8 везём всю папку трейлера.
grep '^FILES_JSON ' "$OUT/build.log" | sed 's/^FILES_JSON //' | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const out = new Set();
    for (const p of JSON.parse(s)) {
      const trailer = p.match(/^(steam\/[^/]+\/trailer-[^/]+)\//);
      out.add(trailer ? trailer[1] : p);
    }
    process.stdout.write([...out].sort().join("\n") + "\n");
  });' > "$OUT/files.txt"
echo "   файлов и папок: $(wc -l < "$OUT/files.txt")"

echo "   демо-ключи"
# Каждому товару и изданию — пачка ключей DEMO-…, чтобы любая покупка в демо выдавала ключ (см. DemoKeysCli).
# Без ключей каждая игра в демо «нет в наличии» — поэтому шаг обязан пройти: ошибка команды (например, старый
# образ бэкенда без demo-keys) или пустой склад после него останавливают сборку.
if ! keys_log="$(cd "$ROOT" && docker compose run --rm --no-deps -e ConnectionStrings__Name="$DEMO_DB" backend demo-keys "${DEMO_KEYS_PER_PRODUCT:-25}" 2>&1)"; then
  echo "$keys_log" | tail -20 >&2
  echo "Демо-ключи не заведены: пересоберите образ бэкенда (docker compose build backend) и запустите снова." >&2
  exit 1
fi
echo "$keys_log" | grep -E "^Demo keys" || true
keys_count="$(docker exec "$PRIMARY" mongosh --quiet "$DEMO_DB" --eval 'db.GameKeys.countDocuments()')"
if [ "${keys_count:-0}" -le 0 ]; then
  echo "В демо-базе нет ни одного ключа — сборка остановлена." >&2
  exit 1
fi
echo "   ключей на складе: $keys_count"

echo "3/4 архив демо-базы"
docker exec "$PRIMARY" sh -c "mongodump --quiet --db '$DEMO_DB' --gzip --archive=/tmp/demo-db.archive.gz"
docker cp "$PRIMARY:/tmp/demo-db.archive.gz" "$OUT/db.archive.gz"
docker exec "$PRIMARY" rm /tmp/demo-db.archive.gz

echo "4/4 медиа"
# Пропавшие файлы не валят сборку: tar их перечислит, а список останется в missing.txt.
docker run --rm -v "$VOLUME:/u:ro" -v "$OUT:/out" alpine sh -c '
  cd /u && : > /out/missing.txt
  while IFS= read -r p; do [ -e "$p" ] && printf "%s\n" "$p" || printf "%s\n" "$p" >> /out/missing.txt; done < /out/files.txt > /out/files.present.txt
  tar -cf /out/uploads.tar -T /out/files.present.txt'
rm -f "$OUT/files.present.txt"

echo "готово: $OUT"
ls -lh "$OUT" | grep -E 'db.archive|uploads.tar'
[ -s "$OUT/missing.txt" ] && echo "нет на диске ($(wc -l < "$OUT/missing.txt")): см. $OUT/missing.txt" || rm -f "$OUT/missing.txt"
