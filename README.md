# Anchor

Anchor turns benefit notices into checked dates, a practical preparation plan, and submission records. It includes fictional practice notices, local PDF/OCR, English/Spanish navigation, an interactive guide, and optional Google accounts with private saved work.

This is the standalone Cloudflare edition: no Sites/ChatGPT hosting account is required. Guests save on their device. Signed-in users sync personal work to D1 and referenced documents to private R2 storage.

## Deploy from GitHub

1. Enable R2 in your Cloudflare account. Review its free allowances and usage billing.
2. In Workers & Pages create a **Worker**, connect this repository, and select branch **main**. Use Worker name **anchor**, matching wrangler.jsonc.
3. Set the root directory to the repository root, **Build command** to `npm run build`, **Deploy command** to `npm run deploy`, and **Node version** to `24`.
4. Wrangler automatically provisions the DB and BUCKET bindings. The deploy script then applies the database migrations. Its deployment token needs Workers, D1, and R2 edit permissions. If provisioning is denied, authorize those permissions or create the resources manually and put their database ID/bucket name in wrangler.jsonc.
5. Wait for the full deployment including migrations to succeed. On the initial deployment account APIs are not ready until migration finishes. Keep the R2 bucket private and leave non-production branch deployments disabled initially.
6. Open the workers.dev URL shown by Cloudflare and follow [Google setup](docs/GOOGLE_SETUP.md).

Use **Workers**, rather than a static Pages upload, because account saving needs the API. Future main-branch pushes rebuild and deploy automatically. If anchor-db or anchor-documents already belong to another project, choose distinct names before deploying. The dashboard Worker name must match the configuration.

## Local development

Use Node.js 24:

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

Wrangler prints its local address, normally http://localhost:8787. Copy .env.example to ignored .dev.vars for local Google testing. The device-only `npm run dev:static` preview runs on port 4317 with no account API. PDF/OCR assets are included; licenses are in web/vendor/licenses.

## Verification

Run `npm test` and `npm run check`. Browser checks require Chrome and the Playwright module; see the test files for ANCHOR_BROWSER_TEST_URL, ANCHOR_PLAYWRIGHT_MODULE, and ANCHOR_BROWSER_EXECUTABLE settings.

Before sharing, complete a real Google login, save a fictional notice and receipt, and verify restoration on a second device. Test logout and account separation. Authentication fixtures do not prove real Google login.

The API verifies Google signatures, audience, issuer, expiry, verified email, and one-use nonces. Sessions use HttpOnly cookies; writes require same-origin requests and CSRF tokens. Revisions detect conflicting changes. Guest and practice data remain separate from account data. Google login needs GOOGLE_CLIENT_ID; it is honestly unavailable until configured.

Anchor helps people organize access to benefits; it does not determine official eligibility or submit applications. Check dates against original notices and official agency sources.

## Source

- web/: website, account UI, guide, notice engine, offline PDF/OCR assets
- server/anchor-api.js: authentication, account workspace, private files
- server/worker.js: standalone routing and security headers
- wrangler.jsonc: hosting and storage bindings
- drizzle/: versioned database migrations
- tests/: notice engine, privacy, account sync, API, and browser verification
- docs/: research, demo, impact, Google setup
