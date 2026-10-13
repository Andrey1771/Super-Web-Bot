#!/usr/bin/env bash
# Восстановление из резервной копии (см. docs/backup-restore.md):
#   ./deploy/restore.sh mongo    backups/mongo-YYYYMMDD-HHMMSS.archive.gz
#   ./deploy/restore.sh keycloak backups/keycloak-YYYYMMDD-HHMMSS.dump
#   ./deploy/restore.sh uploads  backups/uploads-YYYYMMDD-HHMMSS.tar.gz
# Текущие данные заменяются копией целиком. Перед заменой базы делается копия её текущего
# состояния — на случай, если выбран не тот файл.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

kind="${1:-}"
file="${2:-}"
if [ -z "$kind" ] || [ -z "$file" ]; then
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
fi
case "$file" in /*) ;; *) file="$(pwd)/$file" ;; esac
if [ ! -s "$file" ]; then
    echo "Файл не найден или пуст: $file" >&2
    exit 1
fi

if [ "${3:-}" != "--yes" ]; then
    read -r -p "Заменить текущие данные ($kind) копией $(basename "$file")? Введите yes: " answer < /dev/tty
    [ "$answer" = "yes" ] || { echo "Отменено"; exit 1; }
fi

case "$kind" in
    mongo)
        if service_running mongo-backup; then
            docker compose exec -T mongo-backup bash /scripts/mongo-backup.sh --now
        fi
        docker compose stop backend bot
        # --drop: коллекции из копии заменяют текущие, а не дописываются к ним.
        docker compose exec -T mongo1 bash -c '
            auth=()
            if [ -n "${MONGO_INITDB_ROOT_USERNAME:-}" ]; then
                auth=(-u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin)
            fi
            mongorestore --quiet "${auth[@]}" --gzip --archive --drop' < "$file"
        docker compose start backend bot
        ;;
    keycloak)
        if service_running keycloak-db-backup; then
            docker compose exec -T keycloak-db-backup sh /scripts/keycloak-backup.sh --now
        fi
        docker compose stop keycloak
        docker compose exec -T keycloak-db sh -c '
            dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" &&
            createdb -U "$POSTGRES_USER" "$POSTGRES_DB" &&
            pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
        docker compose start keycloak
        ;;
    uploads)
        docker compose stop backend
        docker compose run --rm -T --no-deps --entrypoint sh backend -c '
            find /app/wwwroot/uploads -mindepth 1 -delete &&
            tar -xzf - -C /app/wwwroot/uploads' < "$file"
        docker compose start backend
        ;;
    *)
        echo "Неизвестный вид копии: $kind (mongo, keycloak или uploads)" >&2
        exit 1
        ;;
esac

echo "Готово: $kind восстановлен из $(basename "$file")"
