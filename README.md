# Super-Web-Bot / Tale Shop

Демо-магазин компьютерных игр с Keycloak (OIDC), телеграм-ботом и админ-панелью. Репозиторий представляет монорепо с фронтом Tale Shop, API, ботом и конфигурацией Keycloak/Docker.

## Быстрый запуск (Docker)
1. Установите Docker и Docker Compose.
2. В корне репозитория выполните:
   ```bash
   docker-compose up --build
   ```
3. После сборки фронт будет доступен на `http://localhost:3000`, API — на `http://localhost:7002`, Keycloak — на `http://localhost:8088`.
4. Для работы административных функций импортируйте realm из директории `keyckoak settings (temp)` и создайте пользователя с ролью `admin` в клиенте `tale-shop-app` (realm `TaleShop`).

### Локальный запуск Keycloak (если сертификаты мешают в Docker)
1. Скачайте Keycloak из папки `keyckoak settings (temp)` или используйте существующую установку 26.0.6.
2. В каталоге `keycloak-26.0.6/bin` запустите:
   ```bash
   ./start_keycloak.bat
   ```
3. Откройте `http://localhost:8088/` и импортируйте realm-экспорт из `keyckoak settings (temp)`.

## Разработка фронтенда Tale Shop
1. Перейдите в каталог `tale-gameshop`.
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Запустите дев-сервер:
   ```bash
   npm run start-dev
   ```
4. Продакшн-сборка:
   ```bash
   npm run build
   ```

## English Version

Super-Web-Bot is a monorepo with the Tale Shop game store frontend, backend API, Telegram bot, and Keycloak (OIDC) setup.

### Quick start (Docker)
1. Ensure Docker and Docker Compose are installed.
2. From the repository root run:
   ```bash
   docker-compose up --build
   ```
3. After the build the frontend is served at `http://localhost:3000`, the API at `http://localhost:7002`, and Keycloak at `http://localhost:8088`.
4. Import the realm from `keyckoak settings (temp)` and create an `admin` user in client `tale-shop-app` (realm `TaleShop`) to enable admin features.

### Local Keycloak (when Docker certificates are an issue)
1. Download or reuse Keycloak 26.0.6 from `keyckoak settings (temp)`.
2. Start it from `keycloak-26.0.6/bin`:
   ```bash
   ./start_keycloak.bat
   ```
3. Open `http://localhost:8088/` and import the realm export from `keyckoak settings (temp)`.

### Frontend development
1. Go to `tale-gameshop`.
2. Install dependencies: `npm install`.
3. Run dev server: `npm run start-dev`.
4. Build for production: `npm run build`.

