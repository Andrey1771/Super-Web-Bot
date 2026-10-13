# Общее для сервисов резервного копирования. Подключается через «.» из mongo-backup.sh и др.
# Работает и в bash (образ mongo), и в busybox sh (alpine-образы postgres и rclone).

# Час без ведущего нуля: «08» в арифметике шелла — ошибка (восьмеричное число).
BACKUP_HOUR="${BACKUP_HOUR:-3}"
BACKUP_HOUR=$(( ${BACKUP_HOUR#0} + 0 ))
BACKUP_KEEP="${BACKUP_KEEP:-14}"

log() {
    echo "$(date -u '+%F %T') $*"
}

# Оставить N самых новых файлов по маске, остальные удалить: keep_newest 'mongo-*.archive.gz' 14
keep_newest() {
    ls -1t /backups/$1 2>/dev/null | tail -n +"$(($2 + 1))" | while read -r old; do
        rm -f -- "$old" && log "removed old $old"
    done
}

# Запускать функцию раз в сутки в час HOUR (UTC). Отметка о сделанной копии лежит в файле
# MARKER, поэтому перезапуск контейнера не делает лишнюю копию, а пропущенная (сервер был
# выключен в нужный час) делается при первой возможности после этого часа.
# С аргументом --now — один запуск сразу и выход: docker compose exec <сервис> sh /scripts/<скрипт> --now
run_daily() {
    job="$1" hour="$2" marker="$3" mode="${4:-}"
    if [ "$mode" = "--now" ]; then
        "$job"
        exit $?
    fi
    log "scheduled daily at ${hour}:00 UTC"
    while :; do
        today="$(date -u +%F)"
        now_hour="$(date -u +%H)"
        if [ "${now_hour#0}" -ge "$hour" ] && [ "$(cat "$marker" 2>/dev/null)" != "$today" ]; then
            if "$job"; then
                echo "$today" > "$marker"
            else
                log "FAILED, next attempt in 30 minutes"
                sleep 1500
            fi
        fi
        sleep 300
    done
}
