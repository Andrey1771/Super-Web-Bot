# Keycloak Debug Setup (Keycloak 26.0.6)

> Это **debug-only** setup. Он не изменяет основной `docker-compose.yml` и не предназначен для production.

## Что найдено в репозитории перед реализацией

Реальные существующие Keycloak-артефакты:
- `keyckoak settings (temp)/realm-export.json` (realm `Tale-Shop`, Keycloak 26.0.6, но без клиентов/пользователей).
- `keyckoak settings (temp)/themes/tale-shop/login/theme.properties`.
- `keyckoak settings (temp)/start_keycloak.bat`.
- в основном `docker-compose.yml` есть только закомментированные следы Keycloak, активного сервиса нет.

Почему выбрана новая debug-схема:
- существующий export не содержит готовых users/clients/roles для автоподъема,
- нужен полностью автоматический локальный realm для сайта и Security page,
- production flow должен остаться нетронутым.

## Новые debug-only файлы

- `docker-compose.keycloak-debug.yml`
- `keycloak-debug/realm/taleshop-debug-realm.json`
- `keycloak-debug/themes/tale-shop/login/theme.properties` (копия из `keyckoak settings (temp)`)
- `keycloak-debug/backend-keycloak-admin.debug.json`
- `keycloak-debug/scripts/start-keycloak-debug.sh`
- `keycloak-debug/README.md`

## One-command запуск

```bash
./keycloak-debug/scripts/start-keycloak-debug.sh
```

Альтернатива напрямую:

```bash
docker compose -f docker-compose.keycloak-debug.yml up -d
```

## Что поднимается автоматически

- PostgreSQL для debug Keycloak.
- Keycloak `26.0.6`.
- Realm `TaleShopDebug` авто-импортом (`--import-realm`).
- Пользователи:
  - `admin` / `admin` (`admin@debug.local`)
  - `user` / `user` (`user@debug.local`)
- Клиенты:
  - `tale-shop-app` (public) — для frontend login.
  - `tale-shop-account` (public + Direct Access Grants) — для password validation flow backend.
  - `tale-shop-security-admin` (confidential + service account) — для Keycloak Admin API в Security page.
- Роли:
  - client role `admin` у `tale-shop-app`.
  - пользователь `admin` получает `tale-shop-app:admin`.
  - service account `tale-shop-security-admin` получает `realm-management` роли: `query-users`, `view-users`, `manage-users`.

## Theme

Realm `TaleShopDebug` использует login theme `tale-shop`.
Theme подключается из `keycloak-debug/themes/tale-shop/login/theme.properties` (debug-copy из существующего репозиторного theme-файла).

## Backend local debug values

Используйте значения из `keycloak-debug/backend-keycloak-admin.debug.json`:

- `Keycloak:Admin:BaseUrl = http://localhost:8088`
- `Keycloak:Admin:Realm = TaleShopDebug`
- `Keycloak:Admin:ClientId = tale-shop-security-admin`
- `Keycloak:Admin:ClientSecret = debug-security-admin-secret`
- `Keycloak:Admin:PublicClientId = tale-shop-account`
- `Keycloak:Admin:SecurityRedirectUri = http://localhost:3000/account/security`
- `Keycloak:Admin:AccountConsoleUrl = http://localhost:8088/realms/TaleShopDebug/account`

## Frontend local debug values (если нужно быстро проверить сайт)

Для локальной проверки у frontend realm должен быть `TaleShopDebug` и `clientId=tale-shop-app`.
Обычно это делается через локальный `app-config`/env override без изменения production-конфига.

## Важно

- Это **не** заменяет production realm и не затрагивает production compose.
- Этот setup предназначен только для локальной отладки и smoke-тестов.
