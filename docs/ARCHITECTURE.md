# Anchor architecture

Anchor keeps the resident's workspace usable on a device, then synchronizes
personal work when an authenticated account is available. The static application
can run under a GitHub Pages repository path; no Node server executes in production.
Supabase performs authentication, account authorization, persistent storage, and
conditional database writes.

```text
                       GitHub Pages
                   HTML / CSS / ES modules
                              |
            +-----------------+------------------+
            |                 |                  |
       Local PDF/OCR     Continuity model    Account coordinator
       web/platform.js  src/domain/*.ts     web/account.js
            |                 |                  |
       Browser workers   Typed workflow      Local pending queue
       Bundled readers   + explainable       + conflict handling
            |            case evidence            |
            +-----------------+-------------------+
                              |
                  Supabase transport (TypeScript)
                  src/infrastructure/*.ts
                              |
             Google identity / Postgres SQL / private files
                 supabase/migrations/*.sql
```

## Responsibilities and languages

| Area                                   | Language          | Purpose                                                                                                                                      |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and document processing      | JavaScript        | UI events, local OCR/PDF work, IndexedDB, offline queues, and existing notice extraction                                                     |
| Continuity assessment and presentation | TypeScript        | Explicit fact/action/evidence types, local document inference, and bounded comparisons across notices, supporting documents, and form drafts |
| Authenticated storage boundary         | TypeScript        | Adapt the account coordinator to Supabase Auth, Postgres RPCs, and private file storage                                                      |
| Ownership and concurrency              | SQL / PL/pgSQL    | Derive ownership from authenticated identity, enforce row policies, and atomically compare workspace revisions                               |
| Model training and evaluation          | Python            | Deterministic TF-IDF/logistic training from fictional text; separate held-out and abstention reports                                         |
| Public guidance retrieval              | TypeScript / Deno | A reviewed bilingual corpus and BM25 ranking shared by the browser and authenticated assistant                                               |
| Source maintenance and release audit   | Python            | Check reviewed-source metadata and public fingerprints, artifact portability, OCR assets and licenses, and private-key exposure              |
| Accessible presentation                | HTML / CSS        | Semantic controls, keyboard access, responsive layout, and established Anchor visual styling                                                 |
| Build and deployment orchestration     | YAML              | Reproducible checks and artifact-based GitHub Pages deployment                                                                               |

These boundaries exist because each component has a distinct responsibility.
TypeScript source is bundled into browser ES modules by `scripts/build-pages.mjs`;
generated bundles and `dist/pages` are build products, not files to edit by hand.

## More than a notice parser

The notice parser preserves lines of evidence, dates, and requested items for user
review. The continuity model then considers the whole workspace: multiple notices,
blocking review issues, required preparation, appointments, submission records, and
the difference between preparing a document and retaining confirmation of delivery.
Its suggestions explain the underlying facts and can be explored against the
resident's available time. A simulation is separate from confirmed case history.

Actions form a dependency graph instead of a flat deadline list. Evidence links
refer to the resident's notice and event records; sample data stays visibly
fictional. The app never treats a prepared item, a user-recorded submission, or a
simulation as an agency eligibility or receipt decision. Government source metadata
remains visible in `web/data.js`, with research dates and links to original pages.

## Document intelligence and readiness

PDF text extraction and English/Spanish OCR run through bundled browser readers.
New imports retain bounded page/word rectangles as well as readable text. The
source-location resolver highlights an exact normalized word sequence only; when
it cannot locate that sequence it does not invent a coordinate match.

`src/domain/document-intelligence.ts` performs inference using the checked-in
linear TF-IDF/logistic model. Python trains that model with a deterministic seed
from author-written fictional English/Spanish excerpts. Ranking gates let sparse,
mixed, or unfamiliar text remain unknown. This is a real, small learned classifier,
not a neural model, embedding service, or document authenticator. Explicit rules
extract source-anchored candidate periods, names, and labeled amounts.

`src/domain/evidence-readiness.ts` compares user-confirmed facts with requested
proof and mapped form drafts. Missing documents, unconfirmed facts, different
reporting months, duplicate contents, and compatible monthly amount differences
produce advisory findings. Gross-income comparisons require an explicit monthly
basis, compatible month, exact normalized person match, and a single compatible
record; individual payments are not summed into assumed monthly income. These
checks never alter notice deadlines, preparation state, or submission history.

Evidence metadata is nested under its notice in the existing private workspace.
Files use the same account-owned attachment transport as originals and receipts.
Text, source coordinates, personal values, and file hashes never enter public
model artifacts or provider prompts. The model has only synthetic evaluation;
real-world accuracy and resident outcomes remain unmeasured.

## Public knowledge and optional AI

The shared `supabase/functions/anchor-assistant/knowledge-data.ts` corpus contains
32 bilingual passages from 18 official sources, release `2026-10-12`. Each source
has a jurisdiction, canonical URL, and review date. `knowledge-library.ts` ranks
public passages with BM25 plus reviewed topic, section, and jurisdiction weights.
County retrieval includes federal/statewide guidance and only the selected
county's instructions. The local library search uses browser text filtering and
does not send search text to a provider.

Typed assistant questions are classified locally into bounded public-topic enums.
After verified account and adult-use checks, the backend reconstructs the public
question and retrieves reviewed passages. Gemini receives those passages and
public identifiers, never the resident's typed question, selection, notice text,
answers, or account profile. Strict citation and source-version checks apply on
both sides. The same reviewed guidance remains available without cloud AI.

The Python source checker validates provenance offline and can compare public
page/PDF fingerprints online. A changed or unavailable source requires manual
review; it cannot automatically approve guidance or refresh a review date. Update
and deploy the backend and Pages artifact together when the shared version changes.

## Forms, Spanish guidance, and selected packets

Mapped CF 37 and SAR 7B fields are filled locally on verified official templates.
Draft answers persist with the workspace, and the full unsigned editable form is
downloadable. The Spanish guide translates field labels, help, and preparation
steps while preserving mapped IDs, entered values, and the official PDF's original
language. Original notice wording is never silently translated or replaced.

`src/domain/appointment-packet.ts` builds a typed snapshot from explicitly selected
notices, questions, files, and optional submission history. Its infrastructure
module assembles a printable PDF locally, with selected source wording, file
dividers, and a manifest. Unselected files are not resolved or read. Interactive
official forms remain separate editable downloads; unknown PDFs with form widgets
are rejected rather than silently flattened. Packet generation has bounded file,
text, and page limits and makes no AI, agency, or storage request.

## Account data flow

1. The guest workspace is restored from IndexedDB. Practice data has its own scope.
2. Google produces an ID token; Supabase validates it and issues the account session.
   A fresh challenge hashes the Google nonce while preserving the raw nonce for
   Supabase's exchange, following its provider contract.
3. The coordinator switches to the authenticated account's local scope. Importing
   existing guest work into an empty account is an explicit action.
4. Referenced personal files are uploaded before workspace records reference them.
   Workspace updates include an expected revision; a stale writer receives a
   conflict instead of silently replacing a newer device's changes.
5. SQL functions and row-level policies use `auth.uid()`. Private storage paths are
   account scoped, and database ownership checks do not trust a supplied user ID.
6. Sign-out coordinates pending changes and clears the account's device cache.
   The guest workspace remains independent.

The public Supabase key is an application identifier, not an authorization secret.
Its scope is constrained by SQL and storage policies. OAuth secrets, service-role
keys, and real user documents never belong in the public repository or static site.

## Build, path handling, and offline behavior

The builder accepts an allowlist of public configuration values. It rejects
privileged keys, validates origins and the repository base path, and restricts the
deployment CSP to the configured Supabase project. Relative assets and
scope-relative worker paths allow both a root development server and `/Anchor/`
Pages deployment. Readers, language data, character maps, and required licenses are
bundled for local processing.

The service worker caches the shell, public model/library modules, and local reader
assets. Readers and both OCR languages can be prepared while connected before
offline imports. Account requests go
directly to Supabase and do not enter the service worker cache. IndexedDB retains
pending work for offline recovery; visible synchronization state distinguishes a
local save from an acknowledged remote save.

## Validation boundaries

Pure tests exercise extraction, deterministic continuity scenarios, account
isolation, conflict handling, and transport errors. Browser tests exercise actual
PDF/OCR workers, responsive navigation, the walkthrough, and the application under
a repository subpath. SQL tests run the schema and policies in a local Postgres
engine. Python checks the deployable artifact using only the standard library.

The Python checks reproduce model bytes, preserve train/test separation, and
compare recorded evaluation counts. Public synthetic results include coverage and
abstention denominators. [The study kit](USABILITY_STUDY.md) defines consented
fictional tasks for future sessions; no participant study has been conducted.

The tests do not establish extraction accuracy on unseen real county letters or
prove a remote Google/Supabase account is configured. A release still needs a real
Google login and a second-device restoration check with fictional personal records.
See [Pages setup](PAGES_SETUP.md) for those steps.
