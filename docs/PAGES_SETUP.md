# Deploy Anchor with GitHub Pages and Supabase

GitHub Pages serves the application and local PDF/OCR readers. Supabase supplies
Google authentication, Postgres workspace storage, and a private document bucket.
The app stays usable on one device if account configuration has not been supplied;
it does not display a fake signed-in account or claim that guest work is synced.

## 1. Publish the static app

In [Anchor's repository settings](https://github.com/JaivardhanSamadhiya/Anchor/settings/pages),
set **Pages → Build and deployment → Source → GitHub Actions**. The supplied
`pages.yml` workflow builds `dist/pages`, uploads that directory, and deploys it.
The expected project address is:

```text
https://jaivardhansamadhiya.github.io/Anchor/
```

A successful Actions deployment establishes the live address. A checked-in
workflow alone does not mean deployment has finished. GitHub Free supports Pages
for public repositories; private repository Pages requires an eligible paid plan.
See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 2. Create the Supabase backend

Create a project in your own Supabase account. In its SQL editor, run the migration
in `supabase/migrations/` supplied by this repository. It creates the account
workspace and attachment tables, authenticated RPCs, row-level security policies,
and the private `anchor-documents` bucket. Do not disable these policies or mark the
bucket public. The database derives the owner from `auth.uid()`; the browser does
not get to choose which account owns a row.

Find the project's **Project URL** and **publishable API key** in its dashboard.
The preferred key begins `sb_publishable_`. A legacy `anon` key is supported too.
Never put `sb_secret_`, a `service_role` key, a database password, or an OAuth client
secret into a GitHub variable or website asset. The builder rejects privileged
Supabase keys. [Supabase key documentation](https://supabase.com/docs/guides/getting-started/api-keys)

## 3. Connect Google sign-in

1. Create or edit the **Web application** OAuth client in Google Auth Platform.
2. Set its authorized JavaScript origin to `https://jaivardhansamadhiya.github.io`.
   Origins exclude the `/Anchor/` path. Retain other authorized app origins if needed.
3. Add the callback URL displayed on Supabase's **Authentication → Sign-in/providers → Google** page
   to Google's authorized redirect URIs. Configure the Google client ID and secret
   on that Supabase provider page; keep nonce checking enabled.
4. In Supabase Authentication URL Configuration, set the site URL to
   `https://jaivardhansamadhiya.github.io/Anchor/` and allow that exact redirect address.
5. If Google is in Testing mode, add the accounts that should test the app.

Anchor uses the Google Identity Services button and exchanges the resulting ID
token with Supabase. Its client secret stays in Supabase, outside this repository.
See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 4. Configure the public build inputs

In GitHub **Settings → Secrets and variables → Actions → Variables**, create these
repository variables. These are public identifiers deliberately embedded in the
browser application, so use **Variables**, not Secrets.

| Variable | Value |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Your project's HTTPS origin, such as `https://your-project.supabase.co` |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your publishable key |
| `PUBLIC_GOOGLE_CLIENT_ID` | Your Web client ID ending `.apps.googleusercontent.com` |

The workflow supplies `PUBLIC_BASE_PATH=/Anchor/`. If you rename the repository,
update that value and the matching website addresses. Changes to variables need a
new build: open **Actions → Publish Anchor to GitHub Pages → Run workflow**.
The builder inserts only your configured Supabase origin into the site's network
content security policy.

## 5. Verify the real deployment

- Open the Pages address in a clean browser profile. Complete and replay the guide.
- Try the fictional practice notices, the continuity view, and the local PDF reader.
- Sign in with Google. Add a fictional personal notice, confirm a date, prepare an
  item, and attach a fictional receipt. Wait for the saved status.
- Sign in to the same account in another profile/device. Verify the saved workspace
  and files. Practice work should remain separate from personal work.
- Sign out and sign in as another test account. Confirm that the first account's
  work is absent. Check the SQL policy tests before admitting real personal data.

Do not interpret mocked browser tests as proof that a real Google provider or
Supabase project has been configured. Those live checks require your project and
test accounts. If an account endpoint fails, keep the pending local copy rather
than clearing browser storage.

## Local development and release audit

Use Node 24 and Python 3.11 or newer:

```sh
npm ci
npm run typecheck
npm run build
npm run dev:static
```

For an exact repository-path preview, set `ANCHOR_SERVE_ROOT=dist/pages` and
`ANCHOR_BASE_PATH=/Anchor/` before running the static server, then open its
`/Anchor/` address. Use environment variables for optional public configuration;
no account credentials are required to test the device-only application.

```sh
python -m unittest discover -s tests -p 'test_*.py'
python scripts/audit_sources.py --site dist/pages
```

The audit fails on missing bundles, origin-root asset URLs, absent reader licenses,
reader checksums, unresolved policy source IDs, invalid research dates, and
privileged keys copied into the artifact. It does not contact government sites or
confirm that their policies have remained current.
