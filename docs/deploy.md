# Развёртывание на сервере

Продакшен — это те же контейнеры, что и на стенде, только из готовых образов и с другим набором
compose-файлов:

| Файл | Что в нём |
|---|---|
| `docker-compose.yml` | общее: nginx, backend, bot, Mongo, Keycloak с Postgres, ротация логов |
| `docker-compose.override.yml` | только стенд: сборка из исходников, реплика из трёх узлов Mongo, Mailpit, демо-сид, отладочные порты. `docker compose` подхватывает его сам |
| `docker-compose.prod.yml` | только сервер: https, Mongo с паролями, закрытая админ-консоль Keycloak, certbot, резервные копии |

Образы собирает GitHub Actions (`.github/workflows/images.yml`) при каждом пуше в `main` и кладёт
в ghcr.io. Сервер ничего не собирает: на нём нет ни Node, ни .NET SDK, только Docker.

## Что нужно

- VPS на Linux (Ubuntu 24.04 или Debian 12), **4 ГБ памяти минимум, лучше 8**: в простое Keycloak
  занимает ~600 МБ, Mongo ~400 МБ, остальное — около 300 МБ, плюс запас на пики и сборку
  кэшей. Диск — **от 100 ГБ**: медиа каталога занимают ~26 ГБ на ~570 игр и ~15 ГБ на заведённые
  ~1 100 DLC, плюс образы, резервные копии и запас. Медиа отдаёт сам сервер — канала 100 Мбит/с хватает
  примерно на 35 одновременных зрителей трейлеров в 720p.
- Домен, A-запись которого указывает на IP сервера.
- Почтовый сервис с SMTP на порту 587 (Mailgun, Postmark, Яндекс 360, Zoho…). Порт 465 не
  поддерживается — бэкенд откажется стартовать с понятной ошибкой.

## Первая установка

### 1. Сервер

```bash
# Docker из официального репозитория (в нём сразу compose v2)
curl -fsSL https://get.docker.com | sh

# Файрвол: наружу только SSH и веб. Docker публикует порты в обход ufw, поэтому
# в compose-файлах служебные порты привязаны к 127.0.0.1 — проверять это при каждой правке.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Вход по SSH — только по ключу (`PasswordAuthentication no` в `/etc/ssh/sshd_config`).

### 2. Код и доступ к образам

```bash
git clone https://github.com/Andrey1771/Super-Web-Bot.git /opt/taleshop
cd /opt/taleshop
```

Из репозитория серверу нужны только compose-файлы, `keycloak/` (realm и тема входа) и `deploy/`.

Пакеты в ghcr.io по умолчанию приватные. Либо сделайте их публичными (GitHub → Packages →
пакет → Package settings → Change visibility), либо войдите токеном с правом `read:packages`:

```bash
echo <токен> | docker login ghcr.io -u Andrey1771 --password-stdin
```

### 3. `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Заполнить обязательно (без них `docker compose` откажется запускаться и назовёт переменную):

| Переменная | Значение |
|---|---|
| `COMPOSE_FILE` | раскомментировать: `docker-compose.yml:docker-compose.prod.yml` |
| `DOMAIN` | `shop.example.com` |
| `PUBLIC_URL` | `https://shop.example.com` (без `/` на конце) |
| `LETSENCRYPT_EMAIL` | почта для писем Let's Encrypt |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD` | администратор Mongo |
| `MONGO_APP_PASSWORD` | пароль приложения — **только буквы и цифры** |
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` | вход в админ-консоль Keycloak |
| `KEYCLOAK_DB_PASSWORD` | пароль базы Keycloak |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | секрет сервисного клиента бэкенда |
| `TALESHOP_ADMIN_USER`, `TALESHOP_ADMIN_PASSWORD`, `TALESHOP_ADMIN_EMAIL` | администратор сайта |
| `JWT_SECRET` | случайная строка |
| `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM` | почта (порт 587 и STARTTLS включены по умолчанию) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | live-ключи Stripe |

Пароли и секреты:

```bash
openssl rand -hex 24
```

`hex` — потому что пароль Mongo стоит внутри строки подключения, а остальным всё равно.

Остальное (`BOT_TOKEN`, `DEEPSEEK_API_KEY`, `TURNSTILE_*`, реквизиты продавца…) — по
[pre-launch.md](pre-launch.md). `BOT_WEBHOOK_URL` на сервере оставить пустым: вебхук будет
`{PUBLIC_URL}/api/Telegram`.

### 4. Запуск и сертификат

```bash
docker compose up -d
docker compose ps          # все сервисы Up, mongo-setup — Exited (0)
```

Пока сертификата нет, nginx отдаёт временный самоподписанный — браузер будет ругаться. Выпуск
настоящего (порты 80 и 443 должны быть открыты, DNS — указывать на сервер):

```bash
bash deploy/issue-cert.sh --staging   # пробный: проверить, что всё сходится, не тратя лимит
bash deploy/issue-cert.sh             # настоящий
```

Скрипт сам перезагружает nginx. Дальше сертификат продлевает сервис `certbot`, а nginx
перечитывает его раз в 6 часов.

### 5. Каталог и новости

Каталог собирается из Steam — описания с переводами, скриншоты, трейлеры, требования, обложки.
Все медиа скачиваются к себе в том uploads (`/uploads/steam/{appid}/`): скриншоты в webp, главный
трейлер игры потоком HLS в двух качествах (лучшее до 720p и самое лёгкое), картинки описаний.
Ссылок на CDN Steam в карточках не остаётся. Стартовый список (около 570 популярных платных игр)
вшит в сборку:

```bash
docker compose run -d --name steam-import --no-deps backend import-steam starter
docker logs -f steam-import        # ход; то же видно в админке → Steam import
```

Лимит Steam — около 200 запросов за 5 минут, поэтому список идёт около двух часов. Прерванный
импорт можно запустить снова: заведённые игры пропустятся. Свои списки — в админке
(Steam import: appid или ссылки на страницы Steam, по строке на игру).

DLC к заведённым играм — отдельной командой, после игр. Список DLC каждой игры берётся из Steam,
каждое DLC заводится отдельным товаром со своей страницей и показывается списком на странице игры.
Бесплатные не берутся; `--min-price 10` оставит только крупные (расширения, сезонные пропуска),
`--with-trailers` скачает и ролики. С роликами выходит в среднем ~27 МБ на DLC — на все ~4 200 платных
DLC это ~115 ГБ; без роликов ~1,5 МБ на DLC. В магазине заведены DLC игр от «A» до «D» (~1 100, с роликами),
дальше импорт остановлен решением владельца (2026-10-05):

```bash
docker compose run -d --name dlc-import --no-deps backend import-dlc all --with-trailers
docker logs -f dlc-import
```

Все ~4 200 платных DLC идут около 6–8 часов (тот же лимит Steam; DLC заводятся в 6 потоков, `--parallel N`
меняет число). Повторный запуск продолжает с места остановки; `import-dlc 268500,1091500` — DLC только этих игр (appid базовой игры).

Новости — подготовленные статьи с источниками; их обложки (арт игр) затем скачиваются к себе той же
командой, что переносит медиа уже заведённых игр:

```bash
bash deploy/import-news.sh deploy/content/news-2026-09.json
docker compose run --rm --no-deps backend localize-media
```

`localize-media` ничего не спрашивает у API Steam, только докачивает файлы по адресам из карточек,
и пропускает уже скачанное — его можно запускать сколько угодно раз.

### 6. Проверка

- `https://<домен>` открывается без предупреждения, вход и регистрация работают.
- `https://<домен>/auth/admin/` — **404**: консоль Keycloak снаружи закрыта.
- `curl -I http://<домен>` — `301` на https.
- Письмо «забыли пароль» доходит до настоящего ящика (и не в спам).
- `docker compose logs backend | grep -i fail` — пусто, кроме строки о недоступной Ollama
  (на сервере её нет; чат работает через DeepSeek).

## Админ-консоль Keycloak

Снаружи закрыта: перебор пароля администратора — первое, что делают боты. Открывается через
SSH-туннель:

```bash
ssh -L 8088:127.0.0.1:8088 user@сервер
```

и в браузере на своей машине — `http://localhost:8088/auth/admin`. Ссылки «Keycloak console»
в админке сайта ведут туда же.

`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` создают **временного** администратора при первом
запуске. Сразу после первого входа заведите постоянного (master → Users → Add user, роль `admin`)
и удалите временного — Keycloak сам показывает об этом предупреждение.

## Защита от перегрузки

**Лимиты частоты в nginx** (зоны — `nginx/nginx.conf`, применение — `nginx/locations.conf`), по адресу клиента:

| Что | Лимит | Запас на всплеск |
|---|---|---|
| API (`/api/`), все запросы | 20 в секунду | 40 |
| API, меняющие запросы (POST/PUT/DELETE) | 5 в секунду | 20 |
| Формы Keycloak (вход, регистрация, токены) | 2 в секунду | 10 |
| Кусочки трейлеров (`.m4s`, `.m3u8`) | 30 в секунду | 300 |
| Загрузки и обложки через бэкенд (`/uploads/`) | 60 в секунду | 300 |
| Скриншоты и картинки Steam, статика | без лимита | — |

Бот (`/api/Telegram` и др.) лимитов не получает: вебхуки Telegram приходят пачками с одних адресов.
Обычный посетитель до лимитов не доходит (открытие страницы — 10–25 запросов разом, трейлер на старте —
~70 кусочков за 8 секунд). Лишний запрос сразу получает `429` с JSON `{"edge": true}`, не доходя
до бэкенда; витрина такой ответ тихо повторяет через секунду (до двух раз). Отказы 429 самого бэкенда
(повторная отправка ключей, перебор промокодов) пометки `edge` не имеют и не повторяются.
Срабатывания видны в логе: `docker compose logs nginx | grep "limiting requests"`.

**Лимиты памяти контейнеров** — в `docker-compose.prod.yml` (`mem_limit`): сервис, упёршийся в свой
лимит, перезапускается и не съедает память соседей.

**Если перед сервером встанет Cloudflare** (или другой прокси/CDN), все запросы будут приходить с его
адресов, и лимит станет общим на всех посетителей. До включения проксирования в DNS добавьте в
`http { … }` файла `nginx/nginx.conf` настоящий адрес посетителя из заголовка Cloudflare — диапазоны
адресов берите с https://www.cloudflare.com/ips/ (они меняются, не копируйте из старых инструкций):

```nginx
set_real_ip_from 173.245.48.0/20;   # … все диапазоны ips-v4 и ips-v6
real_ip_header CF-Connecting-IP;
```

После этого `$remote_addr`, лимиты и `X-Real-IP` для бэкенда видят адрес посетителя, а не Cloudflare.

## Обновление

```bash
cd /opt/taleshop
bash deploy/update.sh
```

Скрипт: `git pull` → новые образы из ghcr.io → резервная копия баз → перезапуск изменившихся
сервисов → удаление безымянных старых образов.

Откат на прежнюю сборку: в `.env` `IMAGE_TAG=sha-<полный sha коммита>` (теги — на странице
пакета в GitHub), затем снова `bash deploy/update.sh`. Если новая версия успела поменять данные —
восстановить копию, сделанную перед обновлением ([backup-restore.md](backup-restore.md)).

## Что нельзя менять через `.env` после первого запуска

Эти значения применяются только к пустым томам — потом их меняют в самом сервисе:

- `KEYCLOAK_ADMIN_PASSWORD`, `TALESHOP_ADMIN_PASSWORD` — в Keycloak;
- `MONGO_ROOT_PASSWORD` — в Mongo (`db.changeUserPassword`), потом в `.env`;
- `KEYCLOAK_DB_PASSWORD` — в Postgres (`ALTER USER`), потом в `.env`;
- SMTP Keycloak и адреса клиента `tale-shop-app` — в консоли Keycloak (realm TaleShop →
  Realm settings → Email; Clients).

`MONGO_APP_PASSWORD` — исключение: `mongo-setup` сверяет его при каждом запуске, достаточно
поменять в `.env` и выполнить `docker compose up -d`.

## Стенд разработчика

На своей машине ничего не меняется: `docker compose up -d` (сайт — `http://localhost`,
Keycloak — `http://localhost/auth`, письма — `http://localhost:8025`). Пересоздавать отдельные
сервисы — `docker compose up -d --no-deps <сервис>`.
