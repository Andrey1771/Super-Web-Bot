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

## Support Chat (AI replies)

The storefront support widget answers with either a local Ollama model or the DeepSeek API.
The choice is `SupportChat:Provider`; Ollama stays the fallback in both cases, so the chat keeps
answering when the external API is down, unconfigured, or the daily budget is spent.

```json
SupportChat: {
  "Provider": "ollama",
  "OllamaBaseUrl": "http://localhost:11434",
  "OllamaModel": "qwen2.5:7b",
  "StreamingEnabled": true
}
```

### Local model (default)
1. Install and start Ollama locally:
   ```bash
   ollama serve
   ```
2. Pull the model configured above:
   ```bash
   ollama pull qwen2.5:7b
   ```
3. Run the Web API (Docker or local). The chat widget will call the API at `/api/support/chat/...`.

### DeepSeek
Set the provider and the credentials — in Docker via `.env`, locally via user-secrets or
`appsettings.Development.json`:

```bash
SUPPORT_CHAT_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=<model id from DeepSeek's current price list>
SUPPORT_CHAT_DAILY_BUDGET_USD=5      # 0 = no limit
```

The model id is deliberately not defaulted: DeepSeek's model list changes, and a reasoning model
is the wrong choice here — its thinking tokens are billed as output and slow a streamed reply
down for no benefit. The startup log states which provider is active and warns when the chosen
model looks like a reasoning one.

Spend is tracked per day from the provider's reported token usage, priced by
`InputPricePerMillionUsd` / `CachedInputPricePerMillionUsd` / `OutputPricePerMillionUsd` — keep
those in sync with the current price list. When `DailyBudgetUsd` is reached, the chat switches to
the local model until the next UTC day. The counter lives in process memory, so it resets on
restart and is per-instance, same as the chat's other limiters.

### Instant answers

The most common questions — where the key is, how to activate it, refunds, a declined card,
account recovery — are answered from pre-written bilingual text without calling a model at all:
instant and free. A question is only matched when every required word group hits and the question
is short (`InstantAnswerMaxWords` / `InstantAnswerMaxChars`); anything longer carries specifics a
template cannot address and goes to the model. The same template is never repeated twice in one
conversation — if it did not help the first time, the model takes over. Set
`InstantAnswersEnabled` to `false` to route everything to the model.

Instant replies are counted separately on the admin stats screen, so the share of traffic they
absorb is visible next to what the rest costs.

### Handing over to a human

The chat does not open with a "talk to a human" button. The welcome screen offers topics; a
quiet "this didn't help" link appears only once the assistant has actually answered, and opens a
small panel with the honest wait ("a specialist usually replies within 15 minutes — I can answer
right now") plus a box for what is going wrong. What the customer types there goes into the
conversation as their own message, so the agent opens a case that already has a description
instead of "hello, what happened?".

Set `BusinessHoursEnabled` with `BusinessHoursTimeZone` (IANA id), `BusinessHoursStart`/`End`,
`BusinessDays` (1–7, Mon–Sun) and `ExpectedWaitMinutes` to promise a real time. Outside working
hours the handoff says when a specialist will reply and asks for contact details instead of
leaving someone waiting on a chat nobody is watching. Left disabled, the chat only mentions the
typical wait and never invents an opening time.

Typing "оператор" still escalates instantly, and so does a high-risk word like a break-in or a
chargeback — hiding the button was never the point. The escalation source is recorded separately
for the button and for typed words, so the stats screen shows which one people actually use.

`SupportChat:MaxResponseTokens` caps reply length (output tokens cost more than input), and
`SupportChat:StreamingEnabled` set to `false` turns streaming off. If no model can be reached at
all, the assistant apologises and offers a human handoff.

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

**Prices are always calculated on the server** (`CheckoutPricingService`). The client only sends
`{ gameId, quantity }` plus an optional promo code — the request DTO deliberately carries no
money fields, so a tampered price cannot reach Stripe.

### Webhook events consumed

| Event | Effect |
| --- | --- |
| `payment_intent.succeeded` | Creates the order and dispenses keys |
| `charge.refunded` | Full refund → order `REFUNDED`; partial → `PARTIALLY_REFUNDED` |
| `charge.dispute.created` | Marks payment `DISPUTED` and raises an admin "Payment issue" |

Refunds and chargebacks are handled by `PaymentReconciliationService`. Keys are **not** revoked
automatically — a delivered key may already be activated, so the order is flagged for a human
instead. Note that refunds and chargebacks happen in Stripe regardless of these events; the
events only keep our database in sync, so without them we would give away goods silently.

### Configuration

| Setting | Env var | Where to get it |
| --- | --- | --- |
| `Stripe:SecretKey` | `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys |
| `Stripe:PublishableKey` | `STRIPE_PUBLISHABLE_KEY` | Dashboard → Developers → API keys |
| `Stripe:WebhookSecret` | `STRIPE_WEBHOOK_SECRET` | see below — differs for local vs production |

Without `STRIPE_WEBHOOK_SECRET` the webhook endpoint rejects every request (the signature
cannot be verified), so finalization falls back to the client-side path only.

### Local development

Stripe's servers cannot reach `localhost`, so **creating a webhook endpoint in the Dashboard is
pointless while developing locally** — it would never fire. Events are instead forwarded by the
[Stripe CLI](https://docs.stripe.com/stripe-cli), which opens an outbound tunnel from your machine.

The CLI is a developer tool, not part of the application. It runs **on the host, not in Docker** —
`docker compose` describes the production topology and intentionally has no service for it. Don't
commit its binary either (`stripe-cli/`, `stripe.zip`, `stripe.exe` are git-ignored).

Install it from the [official releases](https://docs.stripe.com/stripe-cli) (`choco install stripe-cli`
or `scoop install stripe` on Windows, `apt`/`brew` on Linux/macOS), then:

```bash
stripe login
stripe listen --forward-to localhost:7002/api/payments/webhook
```

`stripe listen` forwards **all** event types by default, so nothing has to be enabled anywhere for
local testing. Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` in `.env`, then recreate
the backend so it picks the value up:

```bash
docker compose up -d backend
```

Keep the `stripe listen` window open while testing — events that occur while it is not running are
not delivered (they can be replayed with `stripe events resend <id>`).

#### What can be tested locally

| Scenario | How |
| --- | --- |
| Successful purchase | Card `4242 4242 4242 4242` |
| Payment requiring 3-D Secure | Card `4000 0025 0000 3155` |
| Refund | Pay, then Dashboard → Payments → the payment → **Refund** |
| Chargeback / dispute | Card `4000 0000 0000 0259` — succeeds, then is disputed immediately |

In every case the `stripe listen` window should show the event followed by `200`, and the order in
the account should change accordingly.

#### What cannot be tested locally

* A Dashboard webhook endpoint pointing at your machine — Stripe cannot route to `localhost`.
* Anything requiring a public HTTPS domain (real redirects from bank pages, Apple Pay domain
  verification).

### Production

No CLI involved — Stripe reaches the public domain directly. In Stripe Dashboard →
**Developers → Webhooks → Add endpoint** (direct link: `https://dashboard.stripe.com/webhooks`):

* URL: `https://<your-domain>/api/payments/webhook`
* Events: `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`

Then **Reveal signing secret** and put that `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

> The secret printed by `stripe listen` and the secret of a Dashboard endpoint are **different**
> values. Use the CLI one locally and the Dashboard one in production. An endpoint only receives
> the events it is subscribed to — if `charge.refunded` is not selected, refunds will silently not
> be reflected in the database.
