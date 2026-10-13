#!/bin/sh
# Копия каталога резервных копий во внешнее хранилище через rclone — через час после самих копий.
# sync делает хранилище точной копией каталога: старые копии удаляются и там, по тем же правилам.
set -u
. /scripts/lib.sh

if [ -z "${RCLONE_REMOTE:-}" ] || [ ! -s /config/rclone/rclone.conf ]; then
    log "RCLONE_REMOTE or deploy/rclone/rclone.conf is missing — see docs/backup-restore.md"
    exit 1
fi

sync_remote() {
    rclone sync /backups "$RCLONE_REMOTE" --exclude '.last-*' --exclude '*.partial' && log "synced to $RCLONE_REMOTE"
}

run_daily sync_remote "$(((BACKUP_HOUR + 1) % 24))" /tmp/.last-offsite "${1:-}"
