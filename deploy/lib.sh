# Общее для скриптов deploy/*.sh, которые запускаются на сервере из корня репозитория.

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    echo "Нет файла .env в $(pwd) — см. docs/deploy.md" >&2
    exit 1
fi

# Значение переменной из .env (без source: пароли со спецсимволами ломают шелл).
env_value() {
    grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Продакшен-набор файлов compose, если .env не задаёт свой.
if [ -z "${COMPOSE_FILE:-}" ] && [ -z "$(env_value COMPOSE_FILE)" ]; then
    export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
fi

service_running() {
    [ -n "$(docker compose ps --status running -q "$1" 2>/dev/null)" ]
}
