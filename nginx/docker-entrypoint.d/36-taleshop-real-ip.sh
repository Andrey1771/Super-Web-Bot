#!/bin/sh
# Настоящий адрес посетителя за внешним прокси (TALESHOP_TRUSTED_PROXY — адреса или подсети через пробел).
#
# Когда перед этим nginx стоит ещё один (системный nginx сервера, который держит 80/443 для нескольких сайтов,
# или Cloudflare), все запросы приходят с адреса прокси — и лимиты частоты становятся общими на всех. Доверяем
# X-Forwarded-For только от перечисленных адресов: тогда $remote_addr, лимиты и X-Real-IP для бэкенда — адрес
# посетителя. Без переменной ничего не меняется.
set -eu

proxies="${TALESHOP_TRUSTED_PROXY:-}"
trusted=/etc/nginx/trusted-proxies.conf
conf=/etc/nginx/conf.d/00-real-ip.conf
# Список для geo в nginx.conf (схема https от прокси) — пустой, если прокси нет.
: > "$trusted"
rm -f "$conf"
[ -n "$proxies" ] || exit 0

{
    echo "# Сгенерировано 36-taleshop-real-ip.sh из TALESHOP_TRUSTED_PROXY."
    for proxy in $proxies; do
        case "$proxy" in
            *[!0-9a-fA-F.:/]*) echo "taleshop: TALESHOP_TRUSTED_PROXY: '$proxy' — не адрес и не подсеть" >&2; exit 1 ;;
        esac
        echo "set_real_ip_from $proxy;"
        echo "$proxy 1;" >> "$trusted"
    done
    echo "real_ip_header X-Forwarded-For;"
    echo "real_ip_recursive on;"
} > "$conf"
echo "taleshop: адрес посетителя берётся из X-Forwarded-For от $proxies"
