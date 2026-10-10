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

| Area | Language | Purpose |
| --- | --- | --- |
| Workspace and document processing | JavaScript | UI events, local OCR/PDF work, IndexedDB, offline queues, and existing notice extraction |
| Continuity assessment and presentation | TypeScript | Explicit fact/action/evidence types and deterministic analysis across multiple notices |
| Authenticated storage boundary | TypeScript | Adapt the account coordinator to Supabase Auth, Postgres RPCs, and private file storage |
| Ownership and concurrency | SQL / PL/pgSQL | Derive ownership from authenticated identity, enforce row policies, and atomically compare workspace revisions |
| Release audit | Python | Check artifact portability, source coverage, OCR assets and licenses, and private-key exposure without a live service |
| Accessible presentation | HTML / CSS | Semantic controls, keyboard access, responsive layout, and established Anchor visual styling |
| Build and deployment orchestration | YAML | Reproducible checks and artifact-based GitHub Pages deployment |

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

The service worker caches the shell and local reader assets. Account requests go
directly to Supabase and do not enter the service worker cache. IndexedDB retains
pending work for offline recovery; visible synchronization state distinguishes a
local save from an acknowledged remote save.

## Validation boundaries

Pure tests exercise extraction, deterministic continuity scenarios, account
isolation, conflict handling, and transport errors. Browser tests exercise actual
PDF/OCR workers, responsive navigation, the walkthrough, and the application under
a repository subpath. SQL tests run the schema and policies in a local Postgres
engine. Python checks the deployable artifact using only the standard library.

The tests do not establish extraction accuracy on unseen real county letters or
prove a remote Google/Supabase account is configured. A release still needs a real
Google login and a second-device restoration check with fictional personal records.
See [Pages setup](PAGES_SETUP.md) for those steps.
