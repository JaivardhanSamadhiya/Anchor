# Deploy the public-program Gemini assistant

GitHub Pages serves the interface. The Gemini key belongs only in Supabase Edge
Function Secrets; it must never be a GitHub Pages variable, browser constant,
URL parameter, or committed file.

## 1. Apply the new assistant quota migration

**Recommended: use the included GitHub deployment workflow.** Create a Supabase
[personal access token](https://supabase.com/dashboard/account/tokens) with
access to this project and permission to write its database and Edge Functions.
In the Anchor repository, open **Settings → Secrets and variables → Actions →
New repository secret**, name it `SUPABASE_ACCESS_TOKEN`, and paste the token.
This is different from the publishable key or service-role key. Keep the token
out of the website and chat.

After adding `GEMINI_API_KEY` in step 2, open **Actions → Deploy Anchor assistant
→ Run workflow**, select `main`, and run it. The workflow tests the assistant,
applies only the new quota migration, and deploys only `anchor-assistant`. It
uses pinned CLI version `2.120.0` and pinned setup-action commits. It does not
rerun the original accounts migration. You may then skip the manual SQL and
CLI instructions below and proceed to step 4.

In the Supabase project SQL Editor, paste and run only
[`202610100002_anchor_assistant_quota.sql`](../supabase/migrations/202610100002_anchor_assistant_quota.sql).
This adds a private quota table and an atomic authenticated RPC. It does not
recreate existing workspaces or attachments. The new migration can be rerun.

Check deployment without reading any resident information:

```sql
select
  to_regclass('public.anchor_assistant_quotas') is not null as quota_table_exists,
  to_regprocedure('public.anchor_assistant_consume_quota()') is not null as quota_rpc_exists;
```

The RPC limits each authenticated account to eight accepted requests per minute
and forty per hour across all Edge Function instances. It stores counters and
timestamps, not chat questions or model answers. The function fails closed if the
quota migration is missing.

## 2. Add the Gemini secret

Open **Edge Functions → Secrets** in project `rufgpepnoxpbpwmfhwzq`. Add:

| Name                     | Value                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `GEMINI_API_KEY`         | Your Gemini API key                                           |
| `GEMINI_MODEL`           | Optional; defaults to `gemini-3.5-flash-lite`                 |
| `ANCHOR_ALLOWED_ORIGINS` | Optional; defaults to `https://jaivardhansamadhiya.github.io` |

For multiple approved origins, separate exact origins with commas. Include no
path and no trailing slash. Do not use `*`. Supabase automatically supplies the
project URL and backend Auth public key. The Gemini request uses the
`x-goog-api-key` header for both standard and current authorization keys.

Never reveal or re-enter the secret in a browser build. A secret name appearing
in the dashboard proves only that a value is configured; a successful authenticated
function response is needed to prove it works.

## 3. Deploy the function

From this repository, using the [Supabase CLI](https://supabase.com/docs/guides/functions/deploy):

```text
npx supabase@2.120.0 login
npx supabase@2.120.0 functions deploy anchor-assistant --project-ref rufgpepnoxpbpwmfhwzq --no-verify-jwt --use-api
```

The `--no-verify-jwt` setting disables the gateway's legacy JWT check so modern
Supabase signing keys and publishable keys work. It does **not** make the
assistant anonymous: `handler.ts` verifies the exact Bearer token through
Supabase Auth, rejects anonymous users, and calls the quota RPC as that user
before contacting Gemini. Do not remove these checks.

The function entrypoint imports the handler, program/form policies, and public
knowledge modules from the same directory. Deploy the complete
`supabase/functions/anchor-assistant/` directory; the CLI bundles its imports.
If using the dashboard editor instead of the CLI, preserve every module path and
set **Verify JWT** off for this function.

The browser and backend share the reviewed source release `2026-10-12`. Deploy
both the assistant and the Pages artifact when this source version changes.
Mismatched responses are rejected rather than displayed with stale citations.

## 4. Verify from Anchor

Sign in, open the assistant, and select an example public-program question. Cloud
AI requires the adult-use confirmation. Check the response badge:

- **Anchor AI** means a real Gemini API response passed the source and navigation checks.
- **Source guide** means Gemini is unavailable, not enabled, or not selected.

Ask about missing CalFresh proof or finding the Calendar page. The assistant
must return a source link or a navigation button. Source and navigation buttons
require the user's click; model output never edits the case or submits anything.

## Cloud input boundary

Only these structured fields reach the function: `program`, `questionId`,
`focus`, `language`, `adultConfirmed`, optional `jurisdiction`, `destination` for
navigation, and optional reviewed `formContext`. Form context contains only
validated `formId`, `sectionId`, `fieldId`, and public `help` identifiers. The
backend rejects all other fields and reconstructs the public prompt from its own
registry. Natural question text is interpreted locally and the public topic is
shown before requesting Gemini. Documents, OCR text, form answers, case data,
profile information, and conversation history are not sent to Gemini.

The form helper resolves the typed question before making that public request.
An income question selects reviewed income guidance even when an address field
was previously selected. Street-only city requests ask for ZIP/state and offer
an unprefilled USPS lookup link; they do not perform a location search. Unknown
questions request the relevant form context. These direct clarifications are
labeled **Anchor · On-device help**, and make no provider call. Field-specific
public guidance takes precedence over the broader section description.

The source registry covers CalFresh/SNAP, Medi-Cal/Medicaid, Medicare, SSI, SSDI,
Housing Choice Vouchers, WIC, LIHEAP, unemployment insurance, and Anchor
navigation. It is reviewed guidance, not a live agency database or all federal
programs. The registry intentionally excludes changing dollar limits and
individual deadlines; the official agency and actual notice remain authoritative.

The versioned library contains 32 bilingual passages from 18 official sources.
BM25 ranking and reviewed topic/section weights retrieve public guidance before
the prompt is assembled. County filters prevent one county's operational
instructions from appearing under the other county. Browsing and searching the
local library do not call Gemini. See [knowledge maintenance](KNOWLEDGE_LIBRARY.md)
for offline validation, public fingerprint reports, and manual review procedures.

The free Gemini service may use submitted public prompts and responses for
product improvement and human review. Current terms require adult use and forbid
sensitive, confidential, or personal input to unpaid services. Anchor therefore
keeps personal work outside this cloud boundary. Check the
[Gemini terms](https://ai.google.dev/gemini-api/terms),
[key instructions](https://ai.google.dev/gemini-api/docs/api-key), and
[model pricing](https://ai.google.dev/gemini-api/docs/pricing) before changing this policy.

## Automated checks

```text
node --test tests/program-assistant.test.mjs tests/knowledge-library.test.mjs
npm run knowledge:check
```

These tests run the TypeScript sources, simulated HTTP transport, and the real
quota SQL in Postgres (PGlite). They cover private-input rejection, source
allowlisting, valid navigation, identity and quota ordering, oversized streams,
provider failure, and truthful fallback labels. They do not claim a live Gemini
deployment has been tested.
