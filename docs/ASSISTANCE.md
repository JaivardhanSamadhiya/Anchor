# Assistance and preparation boundaries

Anchor helps a resident understand and prepare a request while preserving its original evidence. Preparation, signature, submission, and agency acceptance remain distinct states.

## Data flow

| Input | Processing | Saved or transmitted |
| --- | --- | --- |
| Benefit notice PDF/photo/text | Local PDF.js/Tesseract + deterministic interpretation | Guest IndexedDB, or private Supabase account storage after sign-in |
| Form answers | Typed section model + verified AcroForm mapping | Notice-scoped draft in the same workspace; local unsigned PDF or notes export |
| General chatbot question | Local topic classification | Typed text remains in memory; only approved program/intent/focus/language enums go to the authenticated assistant |
| Gemini explanation | Server retrieval of curated agency facts + structured model output | Validated text, canonical citations and optional navigation; no stored conversation |
| Calendar event | Reviewed notice facts + date filtering + stable SHA-256 ID | Explicitly confirmed generic reminder/date to Google; token remains in memory |

## Grounded public-program assistant

`program-policy.ts` is shared by the client and server. Its program packs contain reviewed agency facts and canonical citation IDs. The browser interprets a natural-language question into a visible public topic; the server rejects arbitrary extra keys and reconstructs the model prompt itself. Changing the browser cannot turn the endpoint into a private-document upload API.

The Edge Function verifies the caller with Supabase Auth, obtains an atomic per-user quota grant, and calls Gemini using its environment secret. Outputs must match a JSON schema. Unknown citation IDs, URLs, navigation targets, excessive text, and invalid structured output are rejected. The browser validates the full response again. Service failures display source guidance with an explicit label, never an invented AI-success state.

The free API option is for adults under the provider's applicable terms and availability. General source guidance remains available without an AI request. This design does not promise personalized eligibility or use Gemini to decide a resident's exact deadline.

## Form preparation

An official form is selected only from a checked source registry and an applicable supported request. Conflicting form codes fall back to a generic preparation guide. The CF 37 mapping is tested against the actual official PDF field names and types. Runtime SHA-256 verification prevents exporting into a different blank with an outdated mapping. Unmapped table answers stay in the notes. Signature fields stay empty, and no export checks off the original task.

SAR 7B and unknown agency forms can be viewed locally with preparation notes. Uploading a different form disables template PDF export. A bounded local PDF viewer handles these longer forms separately from notice-import limits. Drafts are nested in each notice so the existing account schema, attachment ownership validation and conditional saves apply.

## Calendar authorization and retries

Calendar uses Google's browser token model independently of the basic sign-in flow. The requested `calendar.events.owned` permission is broader than Anchor's insert-only behavior, so the preview describes that scope accurately. The token is held in a closure, expires, and is cleared on account changes or disconnect. No event listing, editing, deleting, background refresh or credential synchronization is implemented.

Only explicit checked dates that survive conflict and request checks become candidates. Benefit-period end dates are labeled as context reminders, never guessed filing deadlines. All-day ends are exclusive. The event ID hashes the opaque account/workspace/notice/kind/date tuple, so a retry returns “already added” on a collision without reading or overwriting the resident's existing event.

## Accessible guidance

The tour uses a per-tab session dismissal instead of a permanent browser flag. Verified sign-in can reopen it after the account modal and startup work finish. The next-step cue points to an enabled existing control, preserves its accessibility description, pauses during dialogs and honors reduced-motion preferences. Its date-review cue opens original wording; it cannot automatically confirm an unchecked date.
