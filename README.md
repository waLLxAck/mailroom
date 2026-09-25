# Mailroom — private Lakebed pilot

Hosted app: https://svilen-mailroom.lakebed.app

Tailscale entry: https://asus-omarchy.tail8116cc.ts.net:9443/ (redirects to the hosted app after cutover).

This is a hardened **pilot**, not a production-ready service. Lakebed labels its runtime public alpha. The previous Express application remains in `../mailroom`; the capsule is an independent migration using Lakebed's supported runtime and native authentication.

## Behavior

Sign in with Google, then connect the same Gmail account with read-only access. Choose a rolling time range (24 hours, 7 days, 1/3 months, all time, or custom) and 1–1,000 inbox emails. Previews arrive in batches of five. Full bodies load on demand, which makes the first visible emails arrive sooner without downloading every body first. Failed loads keep completed previews and offer Resume; Stop finishes the in-flight request.

Classify a selected email or the loaded inbox with `typesafe/jev-1.13` through OpenRouter's native `/api/alpha/decisions` API. Noul values remain probabilities, with uncertain decisions between 30% and 70%. Categories include newsletter, marketing, and promotion. A personal deadline means an explicit due time for an expected recipient action; a newsletter publication date or optional sale cutoff does not count. Timing reports measured provider round trips and elapsed batch time, including Gmail fetches and pacing.

## Security and privacy

- Lakebed `auth.requireSignIn` protects all data operations. Every app handler also checks a single immutable owner ID. Initial enrollment requires a verified email matching the server's owner invitation; later accounts with the same email cannot take over the pinned identity.
- Gmail authorization uses random, ten-minute, owner-bound state plus PKCE S256. State is consumed once. The returned Gmail profile must match the owner invitation.
- Only `gmail.readonly` is requested. There are no send, delete, label, or modification operations.
- OAuth access/refresh tokens and pending PKCE verifier are AES-256-GCM encrypted with a separate server env key and owner ID as authenticated additional data. They never reach the client, source bundle, or app logs.
- No email bodies, subjects, previews, or classifications are persisted in the hosted database. They live in the current browser tab and clear on reload/sign-out. Provider requests necessarily transmit the selected text; OpenRouter, TypeSafe, Gmail and Lakebed have their own infrastructure and retention policies.
- Disconnect deletes stored credentials and pending OAuth state. It does not revoke Google's grant or erase platform backups; users can revoke the grant in Google Account connections.
- Server input validation limits email counts, batches, IDs, and cursors. Jev outputs are validated before returning probabilities. Provider errors are sanitized. Email HTML is converted to inert text; remote images, tracking resources, and links in email content are not rendered.
- Per-account pacing, bounded retries and a 700-call daily app budget limit provider usage. Classifications are not automatically retried on uncertain transport/provider failure to avoid duplicate charges.
- Hosted inspection remains private. Never use `deploy --public-inspect`. Secrets are ignored by Git; `.env.lakebed.server` is mode 600. Developer CLI credentials are separate from app identity.

## Platform and pilot limits

Lakebed currently limits handlers to five seconds, deploy database state to 1 MiB, and free-plan requests/mutations to 10,000/1,000 per day. Slow Gmail/OpenRouter calls may fail and require a manual retry. No durable background worker is available: keep the tab open for loading and classification. Completed results in that tab survive a partial batch error, but do not survive reload. Owner tokens persist across deployments.

The app's 700-call allowance leaves some headroom for authentication and other platform operations, but platform quotas can still be reached first (including traffic from other callers). Built-in Lakebed auth/storage routes, infrastructure headers, token storage behavior and availability are platform-controlled; this is not a security certification or a guarantee against denial of service. App errors never claim an email is safe with certainty.

Google's OAuth client is still in Testing and owner-only. This is not a verified public Gmail product. Testing-mode refresh tokens expire after seven days, requiring reconnect ([Google documentation](https://developers.google.com/identity/protocols/oauth2#expiration)). Public distribution would require a separate OAuth verification and restricted-scope compliance review.

Official constraints: https://lakebed.dev/agents.md and https://docs.lakebed.dev/limits/index.md

## Develop and verify

Node 22+ and npm. Lakebed CLI is pinned to 0.0.34. The only installed project dependency is Playwright for tests; capsule app code imports only Lakebed/Preact and local modules.

```
npm ci --ignore-scripts
npm run build
npm test
npm run dev
# In another terminal; Chromium must be installed, or set CHROMIUM_PATH:
npm run test:ui
```

The local server uses port 3002 and keeps its database in memory. Restart resets local data. Never expose local Lakebed inspection routes to the network. Tests use synthetic accounts/messages and mocked provider responses; they do not classify real inbox content or disclose credentials.

Security tests execute the compiled capsule handlers to verify guest denial, owner isolation, PKCE/replay checks, encrypted persistence, disconnect, validation, rate limits and Jev result handling. Browser tests execute the real compiled UI with mocked auth/transport and cover partial recovery, count validation, text injection, Noul decisions, timing display, responsive widths and keyboard modal dismissal.

## Deployment

`lakebed.json` identifies owned deployment `dep_ZlwNrUXDQUpva7kM`. Domain: `svilen-mailroom.lakebed.app`. Claimed deployment has no expiry.

Configure `.env.lakebed.server` using `.env.example`. Never change `DATA_ENCRYPTION_KEY` without a planned token reauthorization: the old encrypted records will become unreadable. Keep an encrypted offline backup of the key in your own secret manager. No secret values are documented here.

Google Cloud project: `mailroom-509610`. Existing OAuth client includes the callback `https://svilen-mailroom.lakebed.app/gmail-connected`. Retain the old Tailscale callback if rolling back to Express.

```
npm run build && npm test
npm run test:ui
npm run deploy
npx --yes lakebed@0.0.34 inspect dep_ZlwNrUXDQUpva7kM --usage
npx --yes lakebed@0.0.34 logs dep_ZlwNrUXDQUpva7kM
```

Deploy replaces server env from `.env.lakebed.server`; maintain the full file. Inspect by deployment ID (custom-domain inspection credential discovery may fail). To roll back, check out a known good source revision and deploy it with the same env and deployment binding. Preserve the account schema and encryption key. Archive the deploy if access must be stopped; archive/termination are not data deletion.

## Verified deployment — September 25, 2026

Seven executable security/provider tests and the browser recovery/responsive suite passed. Dependency audit reported zero vulnerabilities. Hosted Google sign-in and Gmail authorization completed successfully; five real previews loaded, the connection survived redeployment, and one selected email classified successfully with a 233 ms Jev round trip. This is one observed request, not a latency guarantee. Anonymous app WebSocket access was rejected, and anonymous database inspection returned HTTP 401. Hosted health exposes only `{ok, stage}` and no private data.

The existing Tailscale entry now returns a no-store redirect to the canonical Lakebed origin. Old local mutation endpoints return 410 so stale tabs cannot keep using the previous backend. It requires the local machine and its Mailroom service to be running; the Lakebed URL works independently. To restore the old app, remove `PILOT_URL` from `../mailroom/.env` and restart `mailroom.service`. The previous callback remains authorized in Google Cloud.
