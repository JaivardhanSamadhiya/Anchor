# Assistance and preparation boundaries

Anchor helps a resident understand and prepare a request while preserving its original evidence. Preparation, signature, submission, and agency acceptance remain distinct states.

## Data flow

| Input | Processing | Saved or transmitted |
| --- | --- | --- |
| Benefit notice PDF/photo/text | Local PDF.js/Tesseract + deterministic interpretation | Guest IndexedDB, or private Supabase account storage after sign-in |
| Form answers | Typed section model + verified AcroForm mapping | Notice-scoped draft in the same workspace; local unsigned PDF or notes export |
| General chatbot question | Local topic classification | Typed text remains in memory; only approved program/intent/focus/language enums go to the authenticated assistant |
| Highlighted form question | Local matching to reviewed form/section/field identifiers | No highlighted text or answer is retained or transmitted; only identifiers and a public help category cross the AI boundary |
| Gemini explanation | Server retrieval of curated agency facts + structured model output | Validated text, canonical citations and optional navigation; no stored conversation |
| Calendar event | Reviewed notice facts + date filtering + stable SHA-256 ID | Explicitly confirmed generic reminder/date to Google; token remains in memory |

## Grounded public-program assistant

`program-policy.ts` is shared by the client and server. Its program packs contain reviewed agency facts and canonical citation IDs. The browser interprets a natural-language question into a visible public topic; the server rejects arbitrary extra keys and reconstructs the model prompt itself. Changing the browser cannot turn the endpoint into a private-document upload API.

The Edge Function verifies the caller with Supabase Auth, obtains an atomic per-user quota grant, and calls Gemini using its environment secret. Outputs must match a JSON schema. Unknown citation IDs, URLs, navigation targets, excessive text, and invalid structured output are rejected. The browser validates the full response again. Service failures display source guidance with an explicit label, never an invented AI-success state.

The free API option is for adults under the provider's applicable terms and availability. General source guidance remains available without an AI request. This design does not promise personalized eligibility or use Gemini to decide a resident's exact deadline.

## Form preparation

An official form is selected only from a checked source registry and an applicable supported request. Conflicting form codes fall back to a generic preparation guide. CF 37 and SAR 7B mappings are tested against the actual official field names, types and page widgets, including structured household and income rows. Runtime SHA-256 verification prevents using a changed blank with an outdated mapping. Answers update the PDF locally after a short debounce, without replacing the typing controls. The entire editable PDF is exported; signatures and signing dates remain empty, and no export checks off the original task.

The original SAR 7B remains unchanged. An equivalent working copy removes its empty-password PDF encryption while preserving all 14 pages, 304 canonical fields, widget geometry, text and defaults. Both hashes and the derivation are recorded in the source manifest. Filled values are reopened and checked against canonical fields and appearances before returning bytes. Answers that cannot fit legibly or use an unsupported font character produce a clear error rather than silently clipping.

Older freeform table notes are preserved with a visible transfer notice; they are never guessed into individual cells. Manual preparation notes are still available for unmapped information. Unknown agency forms can be viewed locally with preparation notes. Attaching a different form disables template PDF export. Drafts remain nested in each notice, so existing account ownership and conditional saves apply.

The side assistant accepts only reviewed public form identifiers and a meaning, how-to-answer or documents category. The server reconstructs official wording from `form-policy.ts`; arbitrary selections, private questions and answers are rejected at the API boundary. A printed question that cannot be matched uses the current reviewed section, whose name is shown before a request. Unsupported documents do not gain guessed AI question context.

## District and program coverage

`district-services.ts` distinguishes mapped PDF preparation, notice extraction, public program guidance and county links. The current 119th Congress CA16 includes parts of Santa Clara and San Mateo counties; their benefit service areas are countywide. Official address lookup verifies representation. The 2026 election map becomes the representation map in January 2027. CF 37 and SAR 7B are statewide CDSS forms; combined program cases can require other forms supplied by the county. See the reviewed sources in `DISTRICT_SERVICES.md`.

## Calendar authorization and retries

Calendar uses Google's browser token model independently of the basic sign-in flow. The requested `calendar.events.owned` permission is broader than Anchor's insert-only behavior, so the preview describes that scope accurately. The token is held in a closure, expires, and is cleared on account changes or disconnect. No event listing, editing, deleting, background refresh or credential synchronization is implemented.

Only explicit checked dates that survive conflict and request checks become candidates. Benefit-period end dates are labeled as context reminders, never guessed filing deadlines. All-day ends are exclusive. The event ID hashes the opaque account/workspace/notice/kind/date tuple, so a retry returns “already added” on a collision without reading or overwriting the resident's existing event.

## Accessible guidance

The tour uses a per-tab session dismissal instead of a permanent browser flag. Verified sign-in can reopen it after the account modal and startup work finish. The next-step cue points to an enabled existing control, preserves its accessibility description, pauses during dialogs and honors reduced-motion preferences. Its date-review cue opens original wording; it cannot automatically confirm an unchecked date.
