# Anchor

Anchor helps people keep benefit paperwork from becoming a gap in support. It reads a notice on the device, shows the source behind each request and date, and follows the work from review through preparation, submission, saved confirmation, and a resident-recorded agency response.

[Open Anchor](https://jaivardhansamadhiya.github.io/Anchor/) · [Hosting and account setup](docs/PAGES_SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Continuity design](docs/CONTINUITY.md) · [Gemini deployment](docs/assistant-deployment.md) · [Calendar setup](docs/calendar-setup.md)

## What it does

- Reads English CalFresh renewal/verification notices from text, PDF, or photos with local PDF/OCR engines. Unclear dates and unsupported forms require human review.
- Keeps competing dates and multiple notices visible, instead of silently choosing a deadline.
- Builds a dependency graph of the review, preparation, submission, proof, and follow-up stages. An explainable priority queue shows which actions are ready and why others are blocked.
- Compares reversible 15-, 30-, and 60-minute planning sessions with leaving the workspace unchanged. The estimates are planning allowances, not promises about completion or benefit eligibility.
- Suggests exact-wording evidence matches between compatible notices, but requires the user to check the person, period, and original instructions. A link never marks the target prepared or submitted.
- Keeps submission and agency-response records separate. Recording a response does not imply an agency approved benefits.
- Saves guest work locally. Optional Google accounts sync personal work and private documents through Supabase; practice activity remains separate.
- Opens an accessible tour on entry to a new browser tab and after verified sign-in. Animated next-step cues lead to original date wording, the reviewed plan, guided preparation, and saving a submission record. Reduced-motion preferences disable the pulse.
- Opens locally served official CalFresh forms inside a preparation wizard. The CF 37 renewal guide maps verified fields into an unsigned, editable PDF; complex SAR 7B answers stay in preparation notes. Other notices receive request-specific steps and a viewer for the agency's actual uploaded form, without guessed field mappings.
- Provides a public-program assistant for CalFresh/SNAP, Medi-Cal/Medicaid, Medicare, SSI, SSDI, housing, WIC, energy assistance, unemployment, and Anchor navigation. An authenticated, adult-only Gemini option explains a reconstructed public topic with validated agency citations. Typed questions, notice text, profile data and form answers never enter Gemini requests. Source guidance works without AI, sign-in, or a deployed function; each response identifies its mode.
- Optionally creates previewed, private, all-day Google Calendar events for checked dates. Separate incremental authorization, memory-only tokens, and stable event IDs keep Calendar access out of account storage and preserve existing events on retries. Calendar files remain available.
- Includes English/Spanish navigation, source-linked official resources, handoffs, and prepared offline readers.

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

The Gemini function is a separate deployment: keep `GEMINI_API_KEY` in Supabase Edge Function Secrets, add the Supabase personal access token as the GitHub Actions secret `SUPABASE_ACCESS_TOKEN`, then run **Deploy Anchor assistant**. Its idempotent SQL adds authenticated quotas without rerunning the account migration. See [assistant deployment](docs/assistant-deployment.md). Google Calendar also requires its API and optional scope enabled in the Google project; see [Calendar setup](docs/calendar-setup.md).

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
| `src/domain/` — TypeScript | Continuity graph, evidence matching, scheduling, verified form mappings, public-topic policy, Calendar facts |
| `src/ui/` — TypeScript | Escaped continuity/form views and accessible next-action controller |
| `src/infrastructure/` — TypeScript | Account transport, local PDF filling/viewing, incremental Calendar authorization |
| `web/` — JavaScript, HTML, CSS | Notice interpretation, scoped local storage, accessible interface, offline reader |
| `supabase/functions/` — TypeScript/Deno | Verified authentication, grounded Gemini requests, strict citations, public-topic-only boundary |
| `supabase/migrations/` — SQL | Ownership policies, atomic revisions, private file lifecycle, concurrent per-user assistant quotas |
| `scripts/audit_sources.py` — Python | Deployment-path checks, source coverage, vendor integrity, public-config audit |
| `.github/workflows/` — YAML | Repeatable build, tests, and Pages publication |
| `tests/` | Domain cases, real local Postgres policies, transport races, browser journeys, audit failure cases |

Comments explain ownership boundaries, uncertain evidence, and concurrency decisions rather than narrating each line. See the architecture document for data flow and the continuity document for the graph model.

## Verification boundaries

Automated tests exercise the actual notice engine, SQL migration in local Postgres, account/cache isolation, conditional saves, file ownership, malformed input, continuity states, and the real browser interface. Authentication fixtures are fictional; they do not prove a successful real Google login. Complete the cross-device checks in the setup guide after configuring Supabase.

Assistant tests verify source grounding, citation tampering, atomic quotas and account-change races. Form tests load the actual CDSS blank to check all exported field names and empty signatures. Calendar browser tests intercept fictional events and prove that canceling the preview performs no write, duplicate retries preserve edits, and credentials do not enter saved state. These tests do not claim a real resident authorized Google Calendar or that a production Gemini function is already deployed.

Anchor organizes access to services. It does not determine official eligibility, submit applications, predict county acceptance, or infer an official deadline from an uncertain date. Source documents and official agency channels remain authoritative.
