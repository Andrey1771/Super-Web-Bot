# Security & secrets

Real credentials must **never** be committed. This repo is public — anything committed is permanently
exposed (git history, forks, clones), even if deleted later. Secrets are loaded at runtime from the
environment (`.env` for Docker) or from user-secrets (local dev). Committed config files contain only
`__SET_VIA_ENV__` placeholders.

## ⚠️ Leaked secrets — rotate these NOW

These values were committed to the public history and must be considered compromised. Deleting them from
the working tree does **not** undo the exposure — you must invalidate/rotate each one:

| Secret | Where it was | How to rotate |
| --- | --- | --- |
| Telegram bot token | `appsettings.json` (WebApi, BotApi, Development) | @BotFather → your bot → **API Token → Revoke current token**. Put the new token in `.env` → `BOT_TOKEN`. |
| JWT signing key (`JwtSettings:SecretKey`) | `appsettings*.json` | Generate a new one (`openssl rand -base64 48`) → `.env` `JWT_SECRET`. Rotating invalidates all existing user tokens (everyone re-logs in). |
| Keycloak admin client secret | `docker-compose.yml`, `keycloak/import/TaleShop-realm.json` | Set a new strong value in **both** `.env` (`KEYCLOAK_ADMIN_CLIENT_SECRET`) and the realm export's client `tale-shop-admin` (they must match). |
| Stripe keys | `appsettings*.json` | Test keys (`sk_test_`/`pk_test_`) — low risk, but roll them in the Stripe dashboard and set `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`. |
| Mongo / Keycloak DB / admin passwords | `.env` (previously tracked) | Change any of these that are reused elsewhere. (Not wired into the current active compose stack, but were exposed.) |

## Setup

### Docker (compose)
1. `cp .env.example .env`
2. Fill in the values in `.env` (it is gitignored).
3. `docker compose up -d --build`

`docker-compose.yml` maps `.env` values onto config via the `__` separator, e.g.
`BotConfiguration__BotToken=${BOT_TOKEN}` → `BotConfiguration:BotToken`.

### Local dev (running SuperBot.WebApi directly)
Use user-secrets (stored outside the repo):
```bash
cd SuperBot.WebApi
dotnet user-secrets set "BotConfiguration:BotToken" "<token>"
dotnet user-secrets set "JwtSettings:SecretKey"     "<random>"
dotnet user-secrets set "Stripe:SecretKey"          "<sk_test_...>"
dotnet user-secrets set "Stripe:PublishableKey"     "<pk_test_...>"
```
Environment variables and user-secrets override the placeholders in `appsettings.json`.

## Cloudflare — bot & abuse protection for the support chat

Two independent layers; use either or both.

### A. Turnstile (invisible bot check on chat) — code is already wired
1. In the Cloudflare dashboard → **Turnstile** → add a widget for your domain. Copy the **Site key** (public) and **Secret key** (private).
2. Put them in `.env`:
   ```
   TURNSTILE_SITE_KEY=0x4AAAAAAA...
   TURNSTILE_SECRET_KEY=0x4AAAAAAA...
   ```
3. Redeploy the backend. That's it — the widget renders in the chat welcome, and the backend verifies the token when a session is created.

Behavior: **disabled while `TURNSTILE_SECRET_KEY` is empty** (chat works normally). When set, session creation without a valid token is rejected (403). Verification **fails open** if Cloudflare is unreachable, so a Cloudflare outage never takes the chat down. If you later add a Content-Security-Policy, allow `https://challenges.cloudflare.com` in `script-src` and `frame-src`.

### B. Cloudflare edge (protects the whole site, not just chat) — dashboard only, no code
1. Move the domain's DNS to Cloudflare and set the site records to **Proxied** (orange cloud).
2. **Security → Bots → Bot Fight Mode: On** (free) — challenges obvious bots at the edge.
3. **Security → WAF → Rate limiting rules**: add a rule scoped to `/api/support/chat/*`, e.g. *more than 30 requests/min per IP → Managed Challenge*. This stops floods before they ever reach Ollama.
4. Optionally enable **Under Attack Mode** temporarily if you're actively being hit.

This is the highest-ROI layer: it offloads bot filtering and rate limiting to Cloudflare's edge, ahead of the app's own per-IP limits.

## Optional: scrub git history
Rotation is what actually protects you. If you also want to remove the values from history (cosmetic once
rotated), use [`git filter-repo`](https://github.com/newren/git-filter-repo) or the BFG, then force-push.
Note this rewrites history and breaks existing clones — do it only after rotating, and coordinate with any
collaborators.
