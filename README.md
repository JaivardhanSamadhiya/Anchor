# Anchor

Anchor helps people keep benefit paperwork from becoming a gap in support. It reads a notice on the device, shows the source behind each request and date, and follows the work from review through preparation, submission, saved confirmation, and a resident-recorded agency response.

[Open Anchor](https://jaivardhansamadhiya.github.io/Anchor/) · [Architecture](docs/ARCHITECTURE.md) · [Local document model](docs/DOCUMENT_INTELLIGENCE.md) · [Knowledge library](docs/KNOWLEDGE_LIBRARY.md) · [Appointment packets](docs/APPOINTMENT_PACKET.md) · [Demo kit](docs/COMPETITION_DEMO.md)

## What it does

- Reads supported English and Spanish CalFresh renewal/verification notices from text, PDF, or photos with local PDF/OCR engines. Unclear dates and unsupported forms require human review. Original wording stays in its source language.
- Runs a small trained TF-IDF/logistic document classifier on the device to suggest notice, paystub, rent-proof, identity, or utility-bill categories. Sparse, mixed, and unfamiliar text can remain unknown. Suggestions require resident confirmation; scores are not calibrated probabilities.
- Checks supporting evidence against the notice's requested period and the form draft. Findings cover missing or unchecked proof, wrong reporting months, duplicate contents, SAR 7 period differences, and bounded rent or monthly-gross-income inconsistencies. Amount checks require confirmed compatible facts; individual paychecks are not guessed into monthly totals. A match does not establish agency acceptance.
- Preserves PDF/OCR page coordinates for newly imported originals. Where the exact quoted wording can be located, it highlights that area on the original page; otherwise it displays the original without an invented highlight.
- Keeps competing dates and multiple notices visible, instead of silently choosing a deadline.
- Builds a dependency graph of the review, preparation, submission, proof, and follow-up stages. An explainable priority queue shows which actions are ready and why others are blocked.
- Compares reversible 15-, 30-, and 60-minute planning sessions with leaving the workspace unchanged. The estimates are planning allowances, not promises about completion or benefit eligibility.
- Suggests exact-wording evidence matches between compatible notices, but requires the user to check the person, period, and original instructions. A link never marks the target prepared or submitted.
- Keeps submission and agency-response records separate. Recording a response does not imply an agency approved benefits.
- Saves guest work locally. Optional Google accounts sync personal work and private documents through Supabase; practice activity remains separate.
- Opens an accessible tour on entry to a new browser tab and after verified sign-in. Animated next-step cues lead to original date wording, the reviewed plan, guided preparation, and saving a submission record. Reduced-motion preferences disable the pulse.
- Guides answers onto the actual CF 37 and SAR 7B PDFs as users type, including household and income tables. Full unsigned, editable forms can be downloaded. Every mapped field and blank is verified; older freeform drafts remain visible for manual transfer. Other forms can be attached and read with preparation notes.
- Places Ask Anchor alongside the form. Select a printed question or use its help button to get source-linked guidance. Optional authenticated, adult-only AI explains a reviewed public form question reconstructed on the server. Selection text, typed questions and entered answers remain outside AI requests.
- Resolves typed form questions on the device before requesting an explanation. Public income, reporting-period and proof questions select the relevant reviewed field; ambiguous address questions ask for missing information and offer USPS lookup without sending an address. Unrecognized questions ask for form context rather than generating an unrelated field summary.
- Provides Anchor guidance for CalFresh/SNAP, Medi-Cal/Medicaid, Medicare, SSI, SSDI, housing, WIC, energy assistance, unemployment, and navigation. A searchable, versioned library contains 32 bilingual passages from 18 reviewed official sources. BM25 retrieval, public-topic metadata, and jurisdiction filters ground optional AI explanations. Responses identify Anchor AI or the source guide and include validated agency citations. Source guidance works without AI or sign-in.
- Shows reviewed service coverage for Sam Liccardo’s current California 16th District, with Santa Clara and San Mateo county contacts. PDF preparation covers the statewide CF 37 and SAR 7B templates; other programs offer public guidance, and CalWORKs has official county links. County selection does not infer congressional district membership.
- Optionally creates previewed, private, all-day Google Calendar events for checked dates. Separate incremental authorization, memory-only tokens, and stable event IDs keep Calendar access out of account storage and preserve existing events on retries. Calendar files remain available.
- Includes Spanish navigation, supported notice reading, form field guides, readiness findings, public guidance, and packet summaries. Anchor's translated guidance does not translate or replace the original official PDF. Local English/Spanish OCR assets can be prepared once for offline imports.
- Builds a printable appointment PDF from notices, questions, supporting files, and optional submission history that the resident explicitly selects. Unselected files stay out. Official editable forms remain separate unsigned downloads; the packet does not flatten their interactive fields or submit anything.
- Publishes a reproducible fictional model evaluation and a [usability study protocol](docs/USABILITY_STUDY.md). No resident study has been conducted, and synthetic results are not claims about benefits retained or real-world document accuracy.

## GitHub Pages and Supabase

The website is deployed by `.github/workflows/pages.yml`. Enable **Settings → Pages → Source: GitHub Actions**. Main-branch pushes build a static artifact in `dist/pages` and publish it. No Cloudflare account is required.

To activate accounts, create a Supabase project, run `supabase/migrations/202610100001_anchor_accounts.sql`, enable its Google provider, and set these **GitHub Actions repository variables**:

| Variable                          | Value                              |
| --------------------------------- | ---------------------------------- |
| `PUBLIC_SUPABASE_URL`             | Project URL                        |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy anon key |
| `PUBLIC_GOOGLE_CLIENT_ID`         | Google Web client ID               |

These identifiers are intended for the browser. Never publish a service-role key, database password, Google client secret, or real benefit document. The builder rejects secret keys and privileged legacy JWTs. Google provider secrets stay in Supabase. Instructions and real-device activation checks are in [PAGES_SETUP](docs/PAGES_SETUP.md).

With no account configuration, the website honestly stays in device-only mode. Account activation cannot be verified until a project and Google provider are configured.

The Gemini function is a separate deployment: keep `GEMINI_API_KEY` in Supabase Edge Function Secrets, add the Supabase personal access token as the GitHub Actions secret `SUPABASE_ACCESS_TOKEN`, then run **Deploy Anchor assistant**. Its idempotent SQL adds authenticated quotas without rerunning the account migration. See [assistant deployment](docs/assistant-deployment.md). The reviewed knowledge release is `2026-10-12`; deploy the backend and browser together when that shared source version changes. Google Calendar also requires its API and optional scope enabled in the Google project; see [Calendar setup](docs/calendar-setup.md).

## Development

Use Node.js 24 and Python 3.11 or newer.

```sh
npm ci
npm run typecheck
npm run check
npm run knowledge:check
npm run build
npm test
npm run test:python
python scripts/audit_sources.py --site dist/pages
npm run dev:static
```

The preview is normally http://localhost:4317. To preview the exact deployment, serve `dist/pages` with `ANCHOR_SERVE_ROOT=dist/pages` and `ANCHOR_BASE_PATH=/Anchor/`, then open http://localhost:4317/Anchor/.

For real browser tests set `ANCHOR_BROWSER_TEST_URL` to the preview URL and `ANCHOR_PLAYWRIGHT_MODULE` to the absolute file URL of `node_modules/playwright/index.mjs`. Install the browser with `npx playwright install chromium`, or set `ANCHOR_BROWSER_EXECUTABLE` to an existing Chrome executable. GitHub quality CI installs Chromium and runs the browser checks against the exact Pages artifact.

The TypeScript files under `src/` are canonical. Builds generate adjacent browser ES modules in `web/`; generated modules, local session files, and build outputs are ignored by Git. Core PDF/OCR assets are bundled and retain their third-party licenses.

Model training and evaluation need only Python's standard library. `npm run model:train` and `npm run model:evaluate` intentionally regenerate the checked-in public artifacts from fictional fixtures. Python tests verify deterministic model reproduction, train/test separation, and the recorded evaluation. `npm run knowledge:check` validates the reviewed corpus offline. Live source checks report changed or unavailable sources for manual review; they never automatically approve new guidance. See the [source maintenance procedure](docs/KNOWLEDGE_LIBRARY.md).

## Organization and languages

| Directory/language                      | Responsibility                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/` — TypeScript              | Continuity graph, document inference, advisory evidence comparisons, exact source locations, scheduling, verified form mappings, public-topic policy, Calendar facts |
| `src/ui/` — TypeScript                  | Escaped continuity/form views and accessible next-action controller                                                                                                  |
| `src/infrastructure/` — TypeScript      | Account transport, local PDF filling/viewing and packet generation, incremental Calendar authorization                                                               |
| `web/` — JavaScript, HTML, CSS          | Notice interpretation, scoped local storage, accessible interface, offline reader                                                                                    |
| `supabase/functions/` — TypeScript/Deno | Reviewed public corpus and BM25 retrieval, verified authentication, grounded Gemini requests, strict citations, public-topic-only boundary                           |
| `supabase/migrations/` — SQL            | Ownership policies, atomic revisions, private file lifecycle, concurrent per-user assistant quotas                                                                   |
| `scripts/*.py` — Python                 | Reproducible local-model training/evaluation, official-source fingerprint checks, deployment-path and vendor integrity audits                                        |
| `.github/workflows/` — YAML             | Repeatable build, tests, and Pages publication                                                                                                                       |
| `tests/`                                | Domain cases, real local Postgres policies, transport races, browser journeys, audit failure cases                                                                   |

Comments explain ownership boundaries, uncertain evidence, and concurrency decisions rather than narrating each line. See the architecture document for data flow and the continuity document for the graph model.

The languages have specific jobs. Anchor uses a CPU-friendly linear model and maintained lexical retrieval; it does not claim a neural network, embedding database, or unused Rust/ONNX component. Complexity comes from the working document, form, privacy, account, and workflow boundaries.

## Verification boundaries

Automated tests exercise the actual notice engine, SQL migration in local Postgres, account/cache isolation, conditional saves, file ownership, malformed input, continuity states, and the real browser interface. Authentication fixtures are fictional; they do not prove a successful real Google login. Complete the cross-device checks in the setup guide after configuring Supabase.

Assistant tests verify source grounding, citation tampering, atomic quotas, strict public form context and account-change races. Form tests reopen full downloaded PDFs to check canonical values, linked page widgets, visible appearances and empty signatures. Browser tests use fictional records and intercepted account/Calendar requests; they do not prove production provider behavior. The owner separately confirmed the production AI and Calendar connections work.

The local model's held-out benchmark contains 24 separately authored fictional English/Spanish excerpts and six additional abstention challenges. The report states denominators, coverage, hashes, and limitations. It has not been validated on real resident records, degraded OCR, or the full range of county documents. The [study kit](docs/USABILITY_STUDY.md) supplies fictional tasks and an unfilled results template for future consented sessions.

Anchor organizes access to services. It does not determine official eligibility, submit applications, predict county acceptance, or infer an official deadline from an uncertain date. Source documents and official agency channels remain authoritative.
