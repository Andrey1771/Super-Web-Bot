#!/usr/bin/env bash
# Обновление продакшена: свежие compose-файлы из git, новые образы из ghcr.io, перезапуск
# изменившихся сервисов. Запуск на сервере: ./deploy/update.sh
# Откат на прежнюю сборку: IMAGE_TAG=<sha коммита> в .env и снова ./deploy/update.sh
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "== git pull"
git pull --ff-only

echo "== образы"
docker compose pull --quiet

# Копия перед обновлением: новый бэкенд может при старте поменять схему данных, и вернуться
# на старую версию без копии было бы не к чему.
if service_running mongo-backup; then
    echo "== резервная копия перед обновлением"
    docker compose exec -T mongo-backup bash /scripts/mongo-backup.sh --now
    docker compose exec -T keycloak-db-backup sh /scripts/keycloak-backup.sh --now
fi

echo "== перезапуск"
docker compose up -d --remove-orphans

# Старые слои образов после каждого обновления — сотни мегабайт; удаляем только безымянные
# (на которые больше ничего не ссылается).
docker image prune -f >/dev/null

docker compose ps
