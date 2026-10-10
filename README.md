# Anchor

Anchor helps people keep benefit paperwork from becoming a gap in support. It reads a notice on the device, shows the source behind each request and date, and follows the work from review through preparation, submission, saved confirmation, and a resident-recorded agency response.

[Open Anchor](https://jaivardhansamadhiya.github.io/Anchor/) · [Hosting and account setup](docs/PAGES_SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Continuity design](docs/CONTINUITY.md)

## What it does

- Reads English CalFresh renewal/verification notices from text, PDF, or photos with local PDF/OCR engines. Unclear dates and unsupported forms require human review.
- Keeps competing dates and multiple notices visible, instead of silently choosing a deadline.
- Builds a dependency graph of the review, preparation, submission, proof, and follow-up stages. An explainable priority queue shows which actions are ready and why others are blocked.
- Compares reversible 15-, 30-, and 60-minute planning sessions with leaving the workspace unchanged. The estimates are planning allowances, not promises about completion or benefit eligibility.
- Suggests exact-wording evidence matches between compatible notices, but requires the user to check the person, period, and original instructions. A link never marks the target prepared or submitted.
- Keeps submission and agency-response records separate. Recording a response does not imply an agency approved benefits.
- Saves guest work locally. Optional Google accounts sync personal work and private documents through Supabase; practice activity remains separate.
- Includes English/Spanish navigation, a seven-step walkthrough, source-linked official resources, calendar export, handoffs, and prepared offline readers.

## GitHub Pages and Supabase

The website is deployed by `.github/workflows/pages.yml`. Enable **Settings → Pages → Source: GitHub Actions**. Main-branch pushes build a static artifact in `dist/pages` and publish it. No Cloudflare account is required.

To activate accounts, create a Supabase project, run `supabase/migrations/202610100001_anchor_accounts.sql`, enable its Google provider, and set these **GitHub Actions repository variables**:

| Variable | Value |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy anon key |
| `PUBLIC_GOOGLE_CLIENT_ID` | Google Web client ID |

These identifiers are intended for the browser. Never publish a service-role key, database password, Google client secret, or real benefit document. The builder rejects secret keys and privileged legacy JWTs. Google provider secrets stay in Supabase. Instructions and real-device activation checks are in [PAGES_SETUP](docs/PAGES_SETUP.md).

With no account configuration, the website honestly stays in device-only mode. Account activation cannot be verified until a project and Google provider are configured.

## Development

Use Node.js 24 and Python 3.11 or newer.

```sh
npm ci
npm run typecheck
npm run check
npm run build
npm test
python -m unittest discover -s tests -p 'test_*.py'
python scripts/audit_sources.py --site dist/pages
npm run dev:static
```

The preview is normally http://localhost:4317. To preview the exact deployment, serve `dist/pages` with `ANCHOR_SERVE_ROOT=dist/pages` and `ANCHOR_BASE_PATH=/Anchor/`, then open http://localhost:4317/Anchor/.

For real browser tests set `ANCHOR_BROWSER_TEST_URL` to the preview URL and `ANCHOR_PLAYWRIGHT_MODULE` to the absolute file URL of `node_modules/playwright/index.mjs`. Install the browser with `npx playwright install chromium`, or set `ANCHOR_BROWSER_EXECUTABLE` to an existing Chrome executable. GitHub quality CI installs Chromium and runs the browser checks against the exact Pages artifact.

The TypeScript files under `src/` are canonical. Builds generate adjacent browser ES modules in `web/`; generated modules, local session files, and build outputs are ignored by Git. Core PDF/OCR assets are bundled and retain their third-party licenses.

## Organization and languages

| Directory/language | Responsibility |
| --- | --- |
| `src/domain/` — TypeScript | Typed continuity graph, states, evidence matching, scheduling scenarios |
| `src/ui/` — TypeScript | Escaped bilingual continuity presentation |
| `src/infrastructure/` — TypeScript | Supabase authentication and storage transport |
| `web/` — JavaScript, HTML, CSS | Notice interpretation, scoped local storage, accessible interface, offline reader |
| `supabase/migrations/` — SQL | Ownership policies, atomic revision updates, deletion tombstones, private file lifecycle |
| `scripts/audit_sources.py` — Python | Deployment-path checks, source coverage, vendor integrity, public-config audit |
| `.github/workflows/` — YAML | Repeatable build, tests, and Pages publication |
| `tests/` | Domain cases, real local Postgres policies, transport races, browser journeys, audit failure cases |

Comments explain ownership boundaries, uncertain evidence, and concurrency decisions rather than narrating each line. See the architecture document for data flow and the continuity document for the graph model.

## Verification boundaries

Automated tests exercise the actual notice engine, SQL migration in local Postgres, account/cache isolation, conditional saves, file ownership, malformed input, continuity states, and the real browser interface. Authentication fixtures are fictional; they do not prove a successful real Google login. Complete the cross-device checks in the setup guide after configuring Supabase.

Anchor organizes access to services. It does not determine official eligibility, submit applications, predict county acceptance, or infer an official deadline from an uncertain date. Source documents and official agency channels remain authoritative.
