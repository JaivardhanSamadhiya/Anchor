# Supabase boundary

Apply `migrations/202610100001_anchor_accounts.sql` once using the Supabase SQL editor or Supabase CLI. It creates the private `anchor-documents` bucket, resident workspace and attachment tables, owner policies, and checked RPCs. Google must also be enabled in Supabase Authentication. The website receives only the project URL, public publishable key, and Google Web client ID. Service-role keys and Google client secrets never belong in GitHub Pages.

## Responsibilities

- `src/infrastructure/supabase-transport.ts` translates the established fetch-shaped account API into locally bundled Supabase SDK calls.
- `web/account.js` retains offline queues, separate guest/account IndexedDB caches, explicit guest import, and conflict resolution.
- Postgres enforces authenticated ownership, account pinning, schema limits, file quotas, and compare-and-swap workspace revisions.
- Storage authorizes exact paths reserved in the current resident's account. Files become usable only after the upload's size and MIME metadata are checked.

Receipts are immutable once ready. Replacing evidence requires a new attachment ID. Deleting a workspace writes a revision tombstone before marking its files for deletion; cleanup uses the exact old paths so a delayed request cannot erase newly uploaded evidence. Interrupted cleanup can be retried. Anonymous callers cannot read account tables or execute account RPCs.

## Transport integration

`createConfiguredSupabaseTransport(settings)` returns `{ fetch, onAuthChange, destroy }`. Inject `fetch` into `createAccountSync`. Missing configuration produces an honest device-only workspace without sending `/api` requests to GitHub Pages.

`onAuthChange(listener)` returns an unsubscribe function. Notifications include `{ event, userId, previousUserId, external }` and run outside the SDK auth lock. Managed sign-in/sign-out events use `external: false`; external account changes must abort the old account generation before reinitializing. A canceled or hung SDK request cannot block account startup.

Google Identity Services receives a SHA-256 hex nonce. Supabase `signInWithIdToken` receives the raw nonce retained in memory, following [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google). Supabase validates the provider token; this transport never decodes a token as proof of authentication.

## Verification

Run `node --test tests/supabase-sql.test.mjs tests/supabase-transport.test.mjs` using Node 24. SQL tests execute the production migration in PGlite, a real Postgres engine, with stubbed Supabase-provided Auth/Storage schemas. Adapter tests use an SDK fixture. These tests verify ownership and lifecycle logic; production Google sign-in and actual Supabase Storage require the configured live project to complete the deployment acceptance check.