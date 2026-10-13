#!/bin/sh
# База Keycloak: пользователи, пароли, 2FA, настройки realm. Без неё покупатели не смогут войти.
set -u
. /scripts/lib.sh

backup() {
    ts="$(date -u +%Y%m%d-%H%M%S)"
    tmp="/backups/keycloak-$ts.dump.partial"
    # Формат custom (-Fc): сжатый, восстанавливается через pg_restore (см. deploy/restore.sh).
    if ! pg_dump -Fc -f "$tmp"; then
        rm -f "$tmp"
        log "pg_dump failed"
        return 1
    fi
    mv "$tmp" "/backups/keycloak-$ts.dump"
    log "saved keycloak-$ts.dump ($(du -h "/backups/keycloak-$ts.dump" | cut -f1))"
    keep_newest 'keycloak-*.dump' "$BACKUP_KEEP"
}

run_daily backup "$BACKUP_HOUR" /backups/.last-keycloak "${1:-}"
