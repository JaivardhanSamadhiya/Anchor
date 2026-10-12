# Anchor's public knowledge library

Anchor retrieves reviewed public guidance before generating an optional AI explanation. The same library is available locally without an account, network access, or a provider request. It is a bounded process guide, not a live agency integration, an eligibility calculator, or a database of residents' documents.

## What is actually implemented

- `knowledge-data.ts` contains **32 bilingual passages from 18 official sources**, version `2026-10-12`. Each passage names its source, program, public intents, and supported form sections. Each source records its jurisdiction, URL, and review date.
- `knowledge-library.ts` builds a BM25 lexical index. It normalizes English and Spanish text, records term frequencies and document frequencies, and uses document-length normalization. A query is reconstructed from reviewed public intent/focus enums. Exact intent, form-section, and jurisdiction weights supplement term relevance.
- Retrieval filters the corpus by program and jurisdiction before ranking. A Santa Clara selection can retrieve federal, California, and Santa Clara material; it cannot retrieve San Mateo operational instructions. An unspecified county retrieves federal and statewide guidance. County selection does not establish Congressional District membership.
- Form requests retrieve only the reviewed CF 37 or SAR 7B source scope. Public form question and field identifiers are validated against the form registry. A comparison keeps evidence for both programs.
- The Gemini prompt includes the retrieved passages and provenance. Its citation schema is generated from the canonical allowlist. Both server and browser reject invented source identifiers, altered URLs, invalid navigation, and stale release versions. Local fallback explanations use the same retrieval results.

This is weighted lexical retrieval over a deliberately small maintained corpus. It is not an embedding service, live internet search, unrestricted chatbot, or trained document-understanding model. Document processing and private packet checks are separate components.

## Browser integration

Import these exports from the existing `program-assistant.js` build:

```js
import {
  KNOWLEDGE_VERSION,
  KNOWLEDGE_SOURCES,
  KNOWLEDGE_PASSAGES,
  retrievePublicKnowledge,
} from './program-assistant.js';

const passages = retrievePublicKnowledge({
  program: 'calfresh',
  questionId: 'documents',
  focus: 'proof-alternatives',
  language: 'es',
  adultConfirmed: true,
  jurisdiction: 'san-mateo', // optional public enum
});
```

The public jurisdiction choices are `california`, `santa-clara`, and `san-mateo`. Returned evidence records contain `id`, translated `title` and `text`, `sourceId`, `sourceTitle`, canonical `url`, `jurisdiction`, `reviewedAt`, `language`, and a numeric relevance score. All returned evidence is public; the function never echoes request values. Render the evidence through escaped text and the canonical source link.

Age confirmation in that example is a shape requirement of the shared cloud request. Browsing the local public library itself is available to all ages; an actual provider call retains the existing verified account, adult consent, origin controls, and durable quota requirements.

## Privacy boundary

The assistant accepts only validated program, intent, focus, language, optional jurisdiction, and reviewed form identifiers. Typed questions are interpreted locally. Free-form questions, highlighted selections, resident amounts, form answers, attachments, and account profile fields are rejected at the cloud boundary. Retrieval cannot upload a private document: its entire index is the checked-in public corpus.

Spanish text is Anchor's plain-language translation of reviewed guidance, not an official agency translation or a claimed human-translator certification. Official links and county-provided Spanish forms remain authoritative. A fluent usability reviewer should validate the complete Spanish journey before claiming community-tested language accessibility.

## Source maintenance

The Python tool uses only the standard library and public HTTP requests:

```sh
python scripts/check_knowledge_sources.py --offline
python -m unittest discover -s tests -p test_knowledge_sources.py
python scripts/check_knowledge_sources.py --report qa/knowledge-source-report.json
```

`--offline` validates every source's provenance, review age, enum metadata, program coverage, and both languages. The network mode hashes PDF bytes or normalized HTML public text. Script/style changes are excluded; a meaningful page-text change causes `changed_needs_review`. A new URL or missing accepted fingerprint causes `needs_baseline_review`. Fetch errors and challenge pages are `unavailable`, never `unchanged`.

Exit codes are `0` for valid offline data or fully unchanged live fingerprints, `1` for a validation/configuration error, and `2` when live sources need review or cannot be checked. A source outage must not erase the reviewed library or automatically approve new text. Reports contain only public source metadata and hashes.

The initial fingerprint registry records fourteen successfully fetched official pages/PDFs after content review. SSA and DHCS material was reviewed through the official browser-visible pages; those four entries deliberately have no accepted fetch fingerprint because direct automated retrieval was denied or returned a challenge. A later successful fetch therefore requires an initial manual review. All three form fingerprints match the separately verified blank-form asset registry.

When a report flags a change, review the official page, compare the impacted passages and both languages, then update passages, fingerprints, and review dates through an ordinary reviewed commit. Change the shared version and deploy the assistant backend and Pages build together. The checker has no automatic approval flag and refuses to overwrite the accepted corpus or fingerprint registry.

An equal fingerprint establishes content stability only; it does not renew a review date or guarantee agency rules have not changed elsewhere. Reviewed summaries avoid changing income thresholds, award amounts, and individual notice deadlines.
