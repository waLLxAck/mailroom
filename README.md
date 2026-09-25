# Mailroom — powered by Jev

Canonical URL: https://mailroom.lakebed.app

Tailscale entry: https://asus-omarchy.tail8116cc.ts.net:9443/

Mailroom is a public-account Gmail classifier on Lakebed. Each signed-in user gets an isolated account, an encrypted personal OpenRouter key, and editable classification settings. There is no shared OpenRouter API-key fallback. **Google's Gmail OAuth audience is External / In production. Verification is still outstanding, so Google's unverified-app warning and 100-user cap apply.** Lakebed remains alpha infrastructure with shared capacity limits.

## Use

1. Sign in with Google and share a verified email address.
2. In Settings → API key, add your own OpenRouter key. The server validates it with OpenRouter, encrypts it, and never returns it to the UI. Saving a replacement validates before overwriting the old key. Removing the key blocks future classifications.
3. Connect the same Gmail account. Read-only access cannot send, delete or relabel messages.
4. Load 1–1,000 inbox previews for a rolling date range. Batches appear progressively; full bodies load on demand. Failed or stopped batches keep completed previews and offer Resume.
5. Classify selected emails or the loaded inbox. OpenRouter bills your key. Timings measure actual Jev round trips and total elapsed batch time.

Settings → Categories lets users add, rename, describe and remove categories (2–16). Saved categories populate their sidebar. Settings → Classifications edits the built-in reply/spam/phishing/action/deadline questions, enables/disables them, or adds custom yes/no questions (up to 12). Jev returns Noul probabilities for enabled questions. A 51–99% confidence threshold controls likely/uncertain/unlikely display. Urgency remains a standard 0–4 score. Reset defaults updates the draft; Save applies it to the account. Optimistic version checks prevent another tab's changes from being silently overwritten.

Each result carries its settings snapshot/version. Previously classified mail is eligible for reclassification when settings change. Email content and results stay in tab memory, not the hosted database, and clear on reload/sign-out.

## Security

Lakebed sign-in is required for private operations. Every app data lookup uses an index on the authenticated immutable `ownerId`; mutations recheck ownership. Registration is open to verified Google accounts with no invitation list. Two identities sharing an email remain separate accounts. The legacy owner's row migrates through the new owner index without assigning it to another user.

Gmail tokens and pending OAuth state/verifier use AES-256-GCM with per-record random nonces and the account ID as authenticated data. OpenRouter keys use a separate authenticated-data context (`ownerId:openrouter`), so ciphertext cannot be swapped between token types or users. `DATA_ENCRYPTION_KEY` remains server-only and must be preserved across deployments. Secrets are never returned by account status or logged by app handlers.

Gmail OAuth uses random ten-minute state, PKCE S256, one-time consumption and a profile/account match. The browser clears callback parameters immediately. During the rename, the registered legacy Gmail callback relays only to the explicitly owned canonical Mailroom origin; state is still verified against the signed-in account before exchange. Change `GMAIL_REDIRECT_URI` after registering the new callback to remove this transitional hop.

User-controlled settings and provider answers are bounded and validated. Only active question IDs and defined categories are accepted. Email HTML becomes inert text; the app renders no tracking images or executable email markup. Classification sends at most 24,000 cleaned body characters plus metadata and the user's Gmail address to OpenRouter/TypeSafe.

Disconnect deletes Gmail credentials only. Remove API key deletes the OpenRouter credential only. Delete account data explicitly confirms deletion of the account row, tokens, key and settings; sign-out follows. Google/OpenRouter grants and platform backups have separate lifetimes. Hosted inspection stays private; never deploy with `--public-inspect`.

## Operating limits

Lakebed's free limits include five-second handlers, 1 MiB total database state, 10,000 requests/day and 1,000 mutations/day **shared across this deployment**. The app also paces each account and caps it at 700 provider operations/day. These do not reserve capacity per user: other users can exhaust shared hosting capacity. Public usage beyond a small beta requires a larger hosting plan or a different runtime. No durable worker exists; keep the tab open while loading/classifying. Provider timeouts can require manual retry. Uncertain classification failures are not automatically retried to avoid duplicate charges.

The platform controls its own auth, storage, infrastructure security headers and retention behavior. This is not a security certification or production availability guarantee.

## Run and verify

Node 22+, npm and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). Capsule app imports only Lakebed/Preact and local modules; Playwright is development tooling.

```
npm ci --ignore-scripts
npm run build
npm test
npm run dev
# another terminal
npm run test:ui
```

Local dev uses port 3002 and in-memory state. Do not expose its inspection routes to the network. Ten compiled-handler tests cover authentication, account isolation, PKCE/replay, encryption, key ownership/removal/no-fallback, settings isolation/versioning, request limits, disabled/custom questions, and output validation. Browser tests cover progressive recovery, safe email text, personal key entry, category and question editing, disabling reply, measured results, keyboard interaction and responsive layouts. Fixtures mock providers and use no real mailbox content or API keys.

## Deploy

Lakebed CLI is pinned to 0.0.34. Owned deployment `dep_ZlwNrUXDQUpva7kM` is bound in `lakebed.json` and has no expiry. Configure `.env.lakebed.server` from `.env.example`; chmod it to 600. Deployment replaces all hosted server env values from this file. `OPENROUTER_API_KEY` and `OWNER_EMAIL` are intentionally absent and unused.

```
npm run build
npm test
npm run test:ui
npm run deploy
npx --yes lakebed@0.0.34 inspect dep_ZlwNrUXDQUpva7kM --usage
npx --yes lakebed@0.0.34 logs dep_ZlwNrUXDQUpva7kM
```

Use the deployment ID for authenticated inspection; custom-domain credential discovery can fail. To roll back source, redeploy a known good revision with the same deployment binding, schema-compatible data and encryption key. **Do not roll back to the previous shared-key/owner-only server for a public release.**

## Google launch dependency

Cloud project: `mailroom-509610`. The Mailroom Web client has the canonical callback `https://mailroom.lakebed.app/gmail-connected` registered, and the hosted server uses it. Public homepage, privacy and terms links are configured in Google Cloud. Google developer contact includes `svilen.petrov@eniks.ai`.

The app has open account registration. Google Gmail OAuth was published to Production on September 25, 2026, using `svilen.petrov97@gmail.com` as its consent-screen contact with the operator's approval. Google still requires verification for restricted Gmail access; the console currently reports a 100-user cap. Broad Gmail distribution requires verification, including domain ownership and any requested restricted-scope assessment.

## License and contact

Free, open-source software under the MIT license. Mailroom charges no fees and offers no technical support or availability guarantee. Users pay their own OpenRouter usage charges. The address `svilen.petrov97@gmail.com` is for privacy/data-protection matters and Google verification, not technical support.

For your own deployment, remove the existing `deployId` from `lakebed.json`, create your own Google OAuth project and encryption key, and configure your own app origin and redirect URI. Never reuse another deployment's credentials.

Sources: https://docs.lakebed.dev/limits/index.md · https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification · https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key
