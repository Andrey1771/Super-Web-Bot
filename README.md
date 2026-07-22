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

## Stripe payments & webhook

Order finalization (create order + dispense keys) happens in `OrderFinalizationService` and is
triggered by two independent, idempotent paths:

1. the client calling `POST /api/payments/confirm-payment-intent` after the redirect, and
2. the Stripe webhook `POST /api/payments/webhook` (`payment_intent.succeeded`).

The webhook is what makes the order survive a customer closing the tab right after paying.
Both paths are safe to run concurrently — a duplicate order insert is detected and resolved.

### Configuration

| Setting | Env var | Where to get it |
| --- | --- | --- |
| `Stripe:SecretKey` | `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys |
| `Stripe:PublishableKey` | `STRIPE_PUBLISHABLE_KEY` | Dashboard → Developers → API keys |
| `Stripe:WebhookSecret` | `STRIPE_WEBHOOK_SECRET` | see below — differs for local vs production |

Without `STRIPE_WEBHOOK_SECRET` the webhook endpoint rejects every request (the signature
cannot be verified), so finalization falls back to the client-side path only.

### Local development

Stripe cannot reach `localhost`, so webhook events have to be forwarded by the
[Stripe CLI](https://docs.stripe.com/stripe-cli) — a developer tool installed on your machine.
It is not part of the application and is not used in production, so don't commit its binary.

```bash
stripe login
stripe listen --forward-to localhost:7002/api/payments/webhook
```

Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` in `.env`, then recreate the backend
(`docker compose up -d backend`) and pay with test card `4242 4242 4242 4242`.

### Production

No CLI involved. In Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

* URL: `https://<your-domain>/api/payments/webhook`
* Event: `payment_intent.succeeded`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

> The secret from `stripe listen` and the secret of a Dashboard endpoint are **different** values.
