# Super-Web-Bot
Запуск проекта:

1) docker-compose up --build

### Примечание: пока не работает до конца keycloak в prod из под docker (проблема с сертификатами), альтернативный способ его запуска
2) скачать keycloak [Google Drive Link](https://drive.google.com/drive/folders/1ibd1OYW1uvTO3xLvmvBEuFm9hBY-LEP2?usp=sharing)
3) В папке keycloak-26.0.6\bin выполнить: ./start_keycloak.bat

4) перейти http://localhost/

PS необходимо настроить пользователей в keycloak и импортировать realm-export из "keyckoak settings (temp)"
В дальнейшем необходимо создать пользователя с tale-shop-app "admin" в "TaleShop" (realm) для появления возможностей редактирования карточек товаров и добавления их, настроек бота и сайта

# Super-Web-Bot
Project Launch:

1) docker-compose up --build

## FFmpeg install (required for video thumbnails)

### Quick install script (Linux / macOS)
```bash
./scripts/install-ffmpeg.sh
```

### Quick install script (Windows, PowerShell)
```powershell
.\scripts\install-ffmpeg.ps1
```

### Manual install commands

**Ubuntu / Debian**
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

**macOS (Homebrew)**
```bash
brew update
brew install ffmpeg
```

**Windows (Chocolatey, PowerShell as Admin)**
```powershell
choco install ffmpeg -y
```

### Note: Keycloak is not fully functional in production under Docker yet (certificate issues). Here is an alternative way to run it:
2) Download Keycloak: [Google Drive Link](https://drive.google.com/drive/folders/1ibd1OYW1uvTO3xLvmvBEuFm9hBY-LEP2?usp=sharing)

3) In the keycloak-26.0.6\bin folder, run: ./start_keycloak.bat

4) Open http://localhost/ in your browser.

PS: You need to configure users in Keycloak and import the realm-export from "keycloak settings (temp)"
In the future, you must create a user with the tale-shop-app role "admin" in the "TaleShop" (realm) to enable editing product cards, adding new products, and configuring the bot and website.

## Support Chat + Ollama (local LLM)

The storefront support widget uses a local Ollama model for AI replies. Configure these settings in `SuperBot.WebApi/appsettings.json` or via environment variables:

```json
SupportChat: {
  "OllamaBaseUrl": "http://localhost:11434",
  "OllamaModel": "gemma3",
  "StreamingEnabled": true
}
```

### Quick start
1. Install and start Ollama locally:
   ```bash
   ollama serve
   ```
2. Pull the model configured above:
   ```bash
   ollama pull gemma3
   ```
3. Run the Web API (Docker or local). The chat widget will call the API at `/api/support/chat/...`.

If Ollama is unavailable, the assistant gracefully falls back and offers a human handoff. You can also disable streaming by setting `SupportChat:StreamingEnabled` to `false`.

## Account avatar uploads

The account settings page supports avatar uploads and removal.

* Upload endpoint: `POST /api/account/avatar` (multipart file, max 2MB, PNG/JPG/WebP)
* Remove endpoint: `DELETE /api/account/avatar`
* Avatars are stored under `wwwroot/uploads/avatars` and served via `/uploads/avatars/...`.

## Debug-only Keycloak 26.0.6 Docker setup (local development)

> This is a **separate local/debug Keycloak setup**.
> It **does not replace** the production flow and **does not modify** the main production-oriented `docker-compose.yml`.

This repository now contains an additive debug-only Keycloak stack that can be started with one command and is ready for the site without manual realm/client/user creation in Keycloak Admin Console.

### Where the debug setup lives

Debug-only files:

- `docker-compose.keycloak-debug.yml`
- `keycloak-debug/realm/taleshop-debug-realm.json`
- `keycloak-debug/themes/tale-shop/login/theme.properties`
- `keycloak-debug/backend-keycloak-admin.debug.json`
- `keycloak-debug/scripts/start-keycloak-debug.sh`
- `keycloak-debug/README.md` (extended dedicated documentation)

### What this setup is for

Use this setup to run Keycloak locally for development/testing of:

- website login/logout flows,
- role-based admin access (`admin` role for `tale-shop-app`),
- backend Account/Security integration via Keycloak Admin API (`Keycloak:Admin:*` settings),
- security actions (sessions, verify email, reset password, 2FA delegated actions, deactivate flow).

### Important separation from production

- Production Docker flow remains the same.
- Main `docker-compose.yml` is not used/rewritten by this setup.
- Debug realm is **separate** (`TaleShopDebug`) and does not overwrite production realm.

---

### Step-by-step practical guide

### 1) Prerequisites before start

Make sure you have:

- Docker + Docker Compose available locally.
- Free local ports (default debug setup uses `8088` for Keycloak).
- Backend/frontend local run instructions already working from this repository.

Optional but recommended:

- Open `keycloak-debug/README.md` for full debug details.

### 2) Start debug Keycloak

From repository root, run:

```bash
./keycloak-debug/scripts/start-keycloak-debug.sh
```

Alternative (direct compose):

```bash
docker compose -f docker-compose.keycloak-debug.yml up -d
```

### 3) What happens automatically after startup

The debug stack boots and imports everything automatically:

- Keycloak `26.0.6` in Docker,
- dedicated Postgres for debug Keycloak,
- debug realm: `TaleShopDebug`,
- debug users and credentials,
- required clients and roles,
- service account permissions for backend security admin client,
- realm login theme set to `tale-shop`.

No manual Keycloak admin steps are required for the baseline debug flow.

### 4) Realm, users, credentials (auto-created)

Realm:

- `TaleShopDebug`

Users:

- **admin**
  - username: `admin`
  - password: `admin`
  - email: `admin@debug.local`
- **user**
  - username: `user`
  - password: `user`
  - email: `user@debug.local`

### 5) Clients and roles (auto-created)

Clients:

- `tale-shop-app` (public): frontend login client.
- `tale-shop-account` (public + Direct Access Grants enabled): used by backend password validation flow.
- `tale-shop-security-admin` (confidential + service account): used by backend Keycloak Admin API integration.

Roles:

- client role `admin` exists in `tale-shop-app`.
- user `admin` is assigned `tale-shop-app:admin`.
- user `user` does not have admin role.
- service account for `tale-shop-security-admin` has realm-management roles required for security operations.

### 6) Connect backend to debug Keycloak

Use local debug values from:

- `keycloak-debug/backend-keycloak-admin.debug.json`

Key values to apply in local backend config:

- `Keycloak:Admin:BaseUrl = http://localhost:8088`
- `Keycloak:Admin:Realm = TaleShopDebug`
- `Keycloak:Admin:ClientId = tale-shop-security-admin`
- `Keycloak:Admin:ClientSecret = debug-security-admin-secret`
- `Keycloak:Admin:PublicClientId = tale-shop-account`
- `Keycloak:Admin:SecurityRedirectUri = http://localhost:3000/account/security`
- `Keycloak:Admin:AccountConsoleUrl = http://localhost:8088/realms/TaleShopDebug/account`

Also ensure frontend local Keycloak config points to:

- URL: `http://localhost:8088/`
- realm: `TaleShopDebug`
- clientId: `tale-shop-app`

### 7) Run backend + frontend with debug Keycloak

1. Start debug Keycloak (command above).
2. Start backend with local debug Keycloak values.
3. Start frontend with local debug realm/client values.
4. Open site and test auth/admin/security flows.

---

### Manual verification checklist

Use this checklist to verify the debug setup end-to-end:

- [ ] Keycloak login page opens on `http://localhost:8088`.
- [ ] Custom Tale Shop login theme is visible (realm `TaleShopDebug` uses `tale-shop` login theme).
- [ ] `admin/admin` can log in.
- [ ] `user/user` can log in.
- [ ] `admin` has access to site admin capabilities (based on `tale-shop-app` admin role).
- [ ] `user` does **not** have admin privileges.
- [ ] Account **Security page** works against debug Keycloak realm.
- [ ] Backend successfully uses Keycloak Admin integration (`Keycloak:Admin:*`) for security actions.

---

### Additional debug documentation

For complete debug setup details, see:

- `keycloak-debug/README.md`
