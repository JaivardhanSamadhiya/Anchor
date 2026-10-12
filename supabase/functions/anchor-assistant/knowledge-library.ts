/** A shared, bounded retrieval index over reviewed public passages.
 * The server receives only program/intent enums and reconstructs the query.
 * No resident question, form answer, document, or account value is indexed.
 */
import { KNOWLEDGE_DATA } from './knowledge-data.ts';
import { parseFormContext } from './form-policy.ts';
import type { AssistantRequest, Citation, ProgramId } from './program-policy.ts';

export const KNOWLEDGE_VERSION = KNOWLEDGE_DATA.version;
export const KNOWLEDGE_JURISDICTIONS = ['california', 'santa-clara', 'san-mateo'] as const;
export type KnowledgeJurisdiction = (typeof KNOWLEDGE_JURISDICTIONS)[number];
export type SourceJurisdiction = KnowledgeJurisdiction | 'federal';
export interface KnowledgeSource extends Citation {
  jurisdiction: SourceJurisdiction;
  reviewedAt: string;
}
export interface KnowledgePassage {
  id: string;
  sourceId: string;
  program: ProgramId;
  intents: readonly string[];
  focuses: readonly string[];
  formIds: readonly string[];
  sections: readonly string[];
  title: Readonly<{ en: string; es: string }>;
  text: Readonly<{ en: string; es: string }>;
}
export interface KnowledgeEvidence {
  id: string;
  title: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
  url: string;
  jurisdiction: SourceJurisdiction;
  reviewedAt: string;
  language: 'en' | 'es';
  relevance: number;
}

// Freeze nested values too: browser consumers may read this public library,
// but cannot change the shared citation registry during the current session.
export const KNOWLEDGE_SOURCES: readonly KnowledgeSource[] = Object.freeze(
  KNOWLEDGE_DATA.sources.map((entry) => Object.freeze({ ...entry })),
);
export const KNOWLEDGE_PASSAGES: readonly KnowledgePassage[] = Object.freeze(
  KNOWLEDGE_DATA.passages.map((entry) =>
    Object.freeze({
      ...entry,
      intents: Object.freeze([...entry.intents]),
      focuses: Object.freeze([...entry.focuses]),
      formIds: Object.freeze([...entry.formIds]),
      sections: Object.freeze([...entry.sections]),
      title: Object.freeze({ ...entry.title }),
      text: Object.freeze({ ...entry.text }),
    }),
  ),
);
const sourceById = new Map(KNOWLEDGE_SOURCES.map((entry) => [entry.id, entry]));
const stopwords = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'is',
  'it',
  'for',
  'with',
  'your',
  'de',
  'del',
  'el',
  'la',
  'los',
  'las',
  'y',
  'o',
  'en',
  'un',
  'una',
  'su',
  'sus',
  'que',
]);
const tokens = (text: string): string[] =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !stopwords.has(term));
const intentWords: Record<string, string> = {
  overview: 'program overview benefits administered office',
  apply: 'apply application enrollment office appointment',
  renew: 'renewal recertification review interview application signatures',
  documents: 'documents proof verification requested attach missing',
  status: 'status case office waiting list receipt',
  appeal: 'decision hearing disputed office assistance',
  eligibility: 'eligibility requirements rules income household',
  reporting: 'report month changes income required signatures',
  compare: 'different programs overview requirements',
};
const focusWords: Record<string, string> = {
  general: 'official instructions agency',
  identity: 'identity identification verification proof',
  income: 'income gross deductions earned employer payment pay stubs',
  household: 'household family buy prepare food relationship changes',
  'proof-alternatives': 'missing unavailable alternative substitute proof help obtaining',
  interview: 'interview appointment county help',
  timing: 'report month submit dates period notice renewal',
  disability: 'disability help accommodation',
  coverage: 'coverage health insurance renewal',
  waitlist: 'waiting list reopening status',
  'energy-crisis': 'energy crisis disconnection shutoff emergency',
  'ssi-vs-ssdi': 'SSI SSDI different income resources work history',
  'medicare-vs-medicaid': 'Medicare Medicaid Medi Cal different coverage enrollment',
  'snap-vs-wic': 'SNAP CalFresh WIC food appointment different',
};
const sections: Record<string, string> = {
  contact: 'contact language help',
  report: 'report submit month period contact',
  household: 'household food together moved relationship',
  income: 'income employer gross payment proof',
  housing: 'housing rent mortgage utilities expenses',
  expenses: 'expenses child care support medical housing',
  resources: 'resources proof help',
  review: 'review certification signatures date return required proof',
};
const comparisons: Record<string, readonly ProgramId[]> = {
  'ssi-vs-ssdi': ['ssi', 'ssdi'],
  'medicare-vs-medicaid': ['medicare', 'medi-cal'],
  'snap-vs-wic': ['calfresh', 'wic'],
};

const indexed = KNOWLEDGE_PASSAGES.map((passage) => {
  const terms = tokens(
    `${passage.title.en} ${passage.text.en} ${passage.title.es} ${passage.text.es}`,
  );
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
  return { passage, counts, length: terms.length };
});
const averageLength = indexed.reduce((sum, entry) => sum + entry.length, 0) / indexed.length;
const documentFrequency = new Map<string, number>();
for (const entry of indexed)
  for (const term of entry.counts.keys())
    documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);

/** BM25 term relevance plus explicit intent, section and jurisdiction weights.
 * Length normalization stops long passages from winning by sheer word count.
 */
function score(entry: (typeof indexed)[number], query: readonly string[]): number {
  let result = 0;
  for (const term of query) {
    const frequency = entry.counts.get(term) || 0;
    if (!frequency) continue;
    const df = documentFrequency.get(term) || 0;
    const inverseFrequency = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
    const denominator = frequency + 1.2 * (0.25 + (0.75 * entry.length) / averageLength);
    result += inverseFrequency * ((frequency * 2.2) / denominator);
  }
  return result;
}

/** Public callers get copies of a bounded result, never a request echo.
 * The authoritative cloud parser additionally validates all enums and form
 * field IDs. This guard avoids accidentally treating arbitrary search strings
 * as public topics in local views that consume the same export.
 */
export function retrievePublicKnowledge(request: AssistantRequest, limit = 4): KnowledgeEvidence[] {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return [];
  if (
    Object.keys(request).some(
      (key) =>
        ![
          'program',
          'questionId',
          'focus',
          'language',
          'adultConfirmed',
          'destination',
          'formContext',
          'jurisdiction',
        ].includes(key),
    ) ||
    request.program === 'navigation' ||
    !KNOWLEDGE_PASSAGES.some((entry) => entry.program === request.program) ||
    !Object.hasOwn(intentWords, request.questionId) ||
    !Object.hasOwn(focusWords, request.focus) ||
    !['en', 'es'].includes(request.language) ||
    (request.jurisdiction !== undefined && !KNOWLEDGE_JURISDICTIONS.includes(request.jurisdiction))
  )
    return [];
  const programs =
    request.questionId === 'compare' ? comparisons[request.focus] : [request.program];
  if (!programs?.includes(request.program)) return [];
  const form = request.formContext ? parseFormContext(request.formContext) : null;
  if (request.formContext !== undefined && (!form || request.program !== 'calfresh')) return [];
  const query = [
    ...new Set(
      tokens(
        [
          intentWords[request.questionId],
          focusWords[request.focus],
          form ? sections[form.sectionId] || '' : '',
          form?.help === 'documents' ? intentWords.documents : '',
        ].join(' '),
      ),
    ),
  ];
  const maximum = Math.min(8, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 4));
  const ranked = indexed
    .filter(({ passage }) => {
      const source = sourceById.get(passage.sourceId)!;
      if (!programs.includes(passage.program)) return false;
      // A county selection supplements statewide/federal guidance. It never
      // includes another county's operational instructions or proves district.
      if (
        !['federal', 'california'].includes(source.jurisdiction) &&
        source.jurisdiction !== request.jurisdiction
      )
        return false;
      if (form && !passage.formIds.includes(form.formId)) return false;
      return true;
    })
    .map((entry) => ({
      entry,
      relevance:
        score(entry, query) +
        (entry.passage.intents.includes(request.questionId) ? 4 : 0) +
        (entry.passage.focuses.includes(request.focus) ? 5 : 0) +
        (form && entry.passage.sections.includes(form.sectionId) ? 8 : 0) +
        (sourceById.get(entry.passage.sourceId)!.jurisdiction === request.jurisdiction ? 2 : 0),
    }))
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        left.entry.passage.id.localeCompare(right.entry.passage.id),
    );
  // Paired-program questions must retain one passage for each side, even when
  // the higher-scoring program has many more entries in the library.
  const selected =
    request.questionId === 'compare'
      ? programs
          .map((program) => ranked.find(({ entry }) => entry.passage.program === program))
          .filter((entry) => entry !== undefined)
      : [];
  for (const entry of ranked) {
    if (selected.length >= maximum) break;
    if (!selected.includes(entry)) selected.push(entry);
  }
  return selected
    .slice(0, Math.max(maximum, request.questionId === 'compare' ? programs.length : 1))
    .map(({ entry, relevance }) => {
      const passage = entry.passage;
      const source = sourceById.get(passage.sourceId)!;
      return {
        id: passage.id,
        title: passage.title[request.language],
        text: passage.text[request.language],
        sourceId: source.id,
        sourceTitle: source.title,
        url: source.url,
        jurisdiction: source.jurisdiction,
        reviewedAt: source.reviewedAt,
        language: request.language,
        relevance: Math.round(relevance * 1000) / 1000,
      };
    });
}

export const evidenceForRequest = retrievePublicKnowledge;

export function citationsForKnowledge(request: AssistantRequest): Citation[] {
  const unique = new Map<string, Citation>();
  for (const evidence of retrievePublicKnowledge(request))
    unique.set(evidence.sourceId, {
      id: evidence.sourceId,
      title: evidence.sourceTitle,
      url: evidence.url,
    });
  return [...unique.values()];
}
