#!/bin/bash
# База магазина (mongodump) и загруженные файлы (обложки, аватары, медиатека).
set -u
. /scripts/lib.sh

backup() {
    local ts tmp
    ts="$(date -u +%Y%m%d-%H%M%S)"

    tmp="/backups/mongo-$ts.archive.gz.partial"
    if ! mongodump --quiet --host mongo1 --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
            --authenticationDatabase admin --db "$MONGO_DB" --gzip --archive="$tmp"; then
        rm -f "$tmp"
        log "mongodump failed"
        return 1
    fi
    mv "$tmp" "/backups/mongo-$ts.archive.gz"
    log "saved mongo-$ts.archive.gz ($(du -h "/backups/mongo-$ts.archive.gz" | cut -f1))"

    tmp="/backups/uploads-$ts.tar.gz.partial"
    # Медиа игр из Steam (/uploads/steam, ~26 ГБ) в копию не идут: их можно скачать заново
    # (import-steam --update, см. docs/backup-restore.md), а 7 таких копий заняли бы 150 ГБ.
    if ! tar -czf "$tmp" --exclude=./steam -C /uploads .; then
        rm -f "$tmp"
        log "uploads archive failed"
        return 1
    fi
    mv "$tmp" "/backups/uploads-$ts.tar.gz"
    log "saved uploads-$ts.tar.gz ($(du -h "/backups/uploads-$ts.tar.gz" | cut -f1))"

    keep_newest 'mongo-*.archive.gz' "$BACKUP_KEEP"
    # Файлы занимают больше базы, а меняются редко — их копий держим меньше.
    keep_newest 'uploads-*.tar.gz' "${BACKUP_UPLOADS_KEEP:-7}"
}

run_daily backup "$BACKUP_HOUR" /backups/.last-mongo "${1:-}"
