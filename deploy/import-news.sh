#!/usr/bin/env bash
# Публикует подготовленные статьи блога (deploy/content/news-*.json) в базу — на сервере или стенде:
#   bash deploy/import-news.sh deploy/content/news-2026-09.json
# На стенде: COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml bash deploy/import-news.sh …
# Уже существующие адреса пропускаются. Текст — с источниками; обложки — арт игр из Steam (внешние ссылки).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

file="${1:-}"
if [ -z "$file" ] || [ ! -s "$file" ]; then
    echo "Usage: bash deploy/import-news.sh deploy/content/news-YYYY-MM.json" >&2
    exit 1
fi

{
    printf 'const NEWS = '
    cat "$file"
    printf ';\n'
    cat deploy/content/insert-news.js
} | docker compose exec -T mongo1 bash -c '
    db="${MONGO_DB:-SteamShopDatabase}"
    if [ -n "${MONGO_INITDB_ROOT_USERNAME:-}" ]; then
        exec mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$db" --file /dev/stdin
    fi
    # Стенд: реплика без паролей — драйвер сам найдёт primary.
    exec mongosh --quiet "mongodb://mongo1:27017/$db?replicaSet=rs0" --file /dev/stdin'
