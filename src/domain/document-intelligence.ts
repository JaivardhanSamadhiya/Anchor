/**
 * Local document intelligence. A small, reproducibly trained linear model ranks
 * document kinds in the browser; anchored rules expose amounts/periods for review.
 * This module has no network or storage calls. It does not authenticate a document,
 * infer benefit eligibility, or turn a model suggestion into a confirmed fact.
 */
export type DocumentKind =
  'benefit-notice' | 'paystub' | 'rent-proof' | 'identity' | 'utility-bill' | 'unknown';
type ModelLabel = Exclude<DocumentKind, 'unknown'> | 'other';
export type AmountKind = 'gross-income' | 'net-income' | 'rent';
export interface TextEvidence {
  quote: string;
  start: number;
  end: number;
  line: number;
}
export interface MonthCandidate extends TextEvidence {
  month: string;
  role: 'reporting' | 'payment' | 'other';
}
export interface AmountCandidate extends TextEvidence {
  cents: number;
  kind: AmountKind;
}
export interface PersonCandidate extends TextEvidence {
  name: string;
}
export interface DocumentModel {
  schemaVersion: 1;
  version: string;
  algorithm: 'multinomial-logistic-tfidf';
  tokenizer: 'nfkd-ascii-unigrams-bigrams-v1';
  labels: ModelLabel[];
  vocabulary: string[];
  idf: number[];
  weights: number[][];
  bias: number[];
  abstention: {
    minScore: number;
    minMargin: number;
    minKnownWords: number;
    minCoverage: number;
  };
  provenance: {
    corpusSha256: string;
    trainingExamples: number;
    testUsedForTraining: false;
    [key: string]: unknown;
  };
}
export interface DocumentClassification {
  kind: DocumentKind;
  suggestedKind: DocumentKind;
  modelVersion: string;
  /** Softmax ranking score; it has NOT been calibrated as a probability. */
  score: number;
  margin: number;
  knownWords: number;
  vocabularyCoverage: number;
  evidenceTerms: string[];
  reasons: string[];
  needsConfirmation: true;
  truncated: boolean;
}
export interface DocumentInsight {
  version: 1;
  classification: DocumentClassification;
  months: MonthCandidate[];
  amounts: AmountCandidate[];
  people: PersonCandidate[];
  /** Non-cryptographic UI key, never proof of identical files or authenticity. */
  textFingerprint: string;
}
export const DOCUMENT_MODEL_PATH = './models/document-classifier.v1.json';
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  'benefit-notice': 'Benefit notice',
  paystub: 'Paystub / earnings statement',
  'rent-proof': 'Rent receipt / rental agreement',
  identity: 'Identity document',
  'utility-bill': 'Utility bill',
  unknown: 'Other / needs review',
};
const SPANISH_KIND_LABELS: Record<DocumentKind, string> = {
  'benefit-notice': 'Aviso de beneficios',
  paystub: 'Comprobante de nómina / ingresos',
  'rent-proof': 'Recibo de renta / contrato de alquiler',
  identity: 'Documento de identidad',
  'utility-bill': 'Factura de servicios públicos',
  unknown: 'Otro / necesita revisión',
};
export function documentKindLabel(kind: DocumentKind, language: 'en' | 'es' = 'en'): string {
  return (
    (language === 'es' ? SPANISH_KIND_LABELS : DOCUMENT_KIND_LABELS)[kind] ??
    (language === 'es' ? SPANISH_KIND_LABELS.unknown : DOCUMENT_KIND_LABELS.unknown)
  );
}
const LABELS: ModelLabel[] = [
  'benefit-notice',
  'paystub',
  'rent-proof',
  'identity',
  'utility-bill',
  'other',
];
const INPUT_LIMIT = 100_000;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const numericArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(finite);

/** Reject malformed or incompatible public model artifacts before inference. */
export function loadDocumentModel(value: unknown): DocumentModel {
  if (!value || typeof value !== 'object') throw new Error('Document model is unavailable.');
  const model = value as DocumentModel;
  const dimensions = Array.isArray(model.vocabulary) ? model.vocabulary.length : 0;
  if (
    model.schemaVersion !== 1 ||
    model.algorithm !== 'multinomial-logistic-tfidf' ||
    model.tokenizer !== 'nfkd-ascii-unigrams-bigrams-v1' ||
    typeof model.version !== 'string' ||
    !/^[a-z0-9-]{1,80}$/.test(model.version) ||
    !Array.isArray(model.labels) ||
    model.labels.join('|') !== LABELS.join('|') ||
    dimensions < 1 ||
    dimensions > 2048 ||
    !model.vocabulary.every(
      (term) => typeof term === 'string' && /^[a-z#]+(?: [a-z#]+)?$/.test(term),
    ) ||
    new Set(model.vocabulary).size !== dimensions ||
    !numericArray(model.idf, dimensions) ||
    model.idf.some((weight) => weight <= 0 || weight > 20) ||
    !numericArray(model.bias, LABELS.length) ||
    !Array.isArray(model.weights) ||
    model.weights.length !== LABELS.length ||
    !model.weights.every(
      (row) => numericArray(row, dimensions) && row.every((weight) => Math.abs(weight) < 100),
    ) ||
    !model.abstention ||
    !finite(model.abstention.minScore) ||
    model.abstention.minScore <= 0.5 ||
    model.abstention.minScore > 1 ||
    !finite(model.abstention.minMargin) ||
    model.abstention.minMargin < 0.1 ||
    model.abstention.minMargin > 1 ||
    !Number.isInteger(model.abstention.minKnownWords) ||
    model.abstention.minKnownWords < 3 ||
    !finite(model.abstention.minCoverage) ||
    model.abstention.minCoverage <= 0 ||
    model.abstention.minCoverage > 1 ||
    !model.provenance ||
    !/^[a-f0-9]{64}$/.test(model.provenance.corpusSha256) ||
    model.provenance.testUsedForTraining !== false
  ) {
    throw new Error('Document model is incompatible. Your files have not been sent anywhere.');
  }
  return model;
}

function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z]+|[0-9]+/g) ?? []
  ).map((token) => (/^\d+$/.test(token) ? '#' : token));
}
function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);
  tokens.forEach(add);
  for (let i = 1; i < tokens.length; i++) add(`${tokens[i - 1]} ${tokens[i]}`);
  return counts;
}

/** English and Spanish use the same trained vocabulary and deterministic math. */
export function classifyDocument(text: string, model: DocumentModel): DocumentClassification {
  const safeText = String(text ?? '').slice(0, INPUT_LIMIT);
  const tokens = words(safeText);
  const counts = termCounts(tokens);
  const values = model.vocabulary.map((term, i) =>
    counts.has(term) ? (1 + Math.log(counts.get(term)!)) * model.idf[i] : 0,
  );
  const norm = Math.hypot(...values);
  const features = values.map((value) => (norm ? value / norm : 0));
  const logits = model.weights.map((row, index) =>
    row.reduce((sum, weight, i) => sum + weight * features[i], model.bias[index]),
  );
  const peak = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - peak));
  const total = exps.reduce((sum, value) => sum + value, 0);
  const scores = exps.map((value) => value / total);
  const ranked = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const first = ranked[0];
  const margin = first.score - ranked[1].score;
  const vocabulary = new Set(model.vocabulary);
  const uniqueWords = new Set(tokens.filter((word) => word !== '#'));
  const knownWords = [...uniqueWords].filter((word) => vocabulary.has(word)).length;
  const coverage = uniqueWords.size ? knownWords / uniqueWords.size : 0;
  const label = model.labels[first.index];
  const reasons: string[] = [];
  if (knownWords < model.abstention.minKnownWords) reasons.push('insufficient-text');
  if (coverage < model.abstention.minCoverage) reasons.push('unfamiliar-vocabulary');
  if (first.score < model.abstention.minScore) reasons.push('low-model-score');
  if (margin < model.abstention.minMargin) reasons.push('ambiguous-document-kind');
  if (label === 'other') reasons.push('unsupported-document-kind');
  const truncated = String(text ?? '').length > INPUT_LIMIT;
  const kind = reasons.length || label === 'other' ? 'unknown' : label;
  if (!reasons.length) reasons.push('suggestion-needs-resident-confirmation');
  if (truncated) reasons.push('text-was-shortened');
  const evidenceTerms = features
    .map((value, i) => ({
      term: model.vocabulary[i],
      contribution: value * model.weights[first.index][i],
    }))
    .filter((term) => term.contribution > 0 && !term.term.includes('#'))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 6)
    .map((term) => term.term);
  return {
    kind,
    suggestedKind: label === 'other' ? 'unknown' : label,
    modelVersion: model.version,
    score: first.score,
    margin,
    knownWords,
    vocabularyCoverage: coverage,
    evidenceTerms,
    reasons,
    needsConfirmation: true,
    truncated,
  };
}

function anchor(text: string, start: number, end: number): TextEvidence {
  return {
    quote: text.slice(start, end),
    start,
    end,
    line: text.slice(0, start).split(/\r\n|\r|\n/).length,
  };
}
const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  enero: 1,
  february: 2,
  feb: 2,
  febrero: 2,
  march: 3,
  mar: 3,
  marzo: 3,
  april: 4,
  apr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  june: 6,
  jun: 6,
  junio: 6,
  july: 7,
  jul: 7,
  julio: 7,
  august: 8,
  aug: 8,
  agosto: 8,
  september: 9,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  october: 10,
  oct: 10,
  octubre: 10,
  november: 11,
  nov: 11,
  noviembre: 11,
  december: 12,
  dec: 12,
  diciembre: 12,
};
export function validReportingMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
}
function validDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Candidates retain exact text offsets; none is a user-confirmed reporting period. */
export function extractMonthCandidates(text: string): MonthCandidate[] {
  const safeText = String(text ?? '').slice(0, INPUT_LIMIT);
  const result: MonthCandidate[] = [];
  const add = (start: number, end: number, year: number, month: number) => {
    const value = `${year}-${String(month).padStart(2, '0')}`;
    if (!validReportingMonth(value)) return;
    const before = safeText
      .slice(Math.max(0, safeText.lastIndexOf('\n', start) + 1), start)
      .slice(-85);
    let role: MonthCandidate['role'] = 'other';
    if (/pay\s*date|paid\s*on|payment\s*date|fecha\s+de\s+pago/i.test(before)) role = 'payment';
    else if (
      /pay\s*period|report(?:ing)?\s*(?:month|period)|rental?\s*(?:month|period|for)|earnings\s*period|billing\s*period|per[ií]odo\s*(?:de\s*)?(?:pago|trabajado|alquiler|facturaci[oó]n)|mes\s*(?:de\s*)?(?:reporte|alquiler)|renta\s*(?:de|del)|alquiler\s*(?:de|del)/i.test(
        before,
      )
    )
      role = 'reporting';
    result.push({ ...anchor(safeText, start, end), month: value, role });
  };
  const names = Object.keys(MONTHS)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const named = new RegExp(
    `\\b(${names})\\.?\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+)?(?:de\\s+)?((?:19|20|21)\\d{2})\\b`,
    'gi',
  );
  for (const match of safeText.matchAll(named)) {
    const month = MONTHS[match[1].toLowerCase()];
    const year = Number(match[3]);
    if (match[2] && !validDay(year, month, Number(match[2]))) continue;
    const spanishDay = safeText
      .slice(Math.max(0, match.index! - 10), match.index!)
      .match(/\b(\d{1,2})\s+de\s+$/i);
    if (spanishDay && !validDay(year, month, Number(spanishDay[1]))) continue;
    add(
      spanishDay ? match.index! - spanishDay[0].length : match.index!,
      match.index! + match[0].length,
      year,
      month,
    );
  }
  for (const match of safeText.matchAll(/\b((?:19|20|21)\d{2})-(0[1-9]|1[0-2])(?:-(\d{2}))?\b/g)) {
    if (match[3] && !validDay(Number(match[1]), Number(match[2]), Number(match[3]))) continue;
    add(match.index!, match.index! + match[0].length, Number(match[1]), Number(match[2]));
  }
  for (const match of safeText.matchAll(/\b(\d{1,2})\/(\d{1,2})\/((?:19|20|21)\d{2})\b/g)) {
    // An ambiguous numeric order is not used as a reporting-month proposal.
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (day <= 12 || !validDay(Number(match[3]), month, day)) continue;
    add(match.index!, match.index! + match[0].length, Number(match[3]), month);
  }
  return result.sort((a, b) => a.start - b.start).slice(0, 80);
}

/** Parse explicitly labeled amounts only; gross and net are never interchangeable. */
export function extractAmountCandidates(text: string): AmountCandidate[] {
  const safeText = String(text ?? '').slice(0, INPUT_LIMIT);
  const result: AmountCandidate[] = [];
  const labels: [AmountKind, RegExp][] = [
    [
      'gross-income',
      /\b(?:gross\s*(?:pay|income|earnings|wages)|current\s+gross|(?:sueldo|salario|ingresos?|ganancias)\s+brut[oa]s?)\s*(?:[:=]|of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)\b/gi,
    ],
    [
      'net-income',
      /\b(?:net\s*(?:pay|income|earnings|wages)|(?:sueldo|salario|pago)\s+net[oa])\s*(?:[:=]|of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)\b/gi,
    ],
    [
      'rent',
      /\b(?:(?:monthly\s+)?rent(?:al\s+amount)?|(?:renta|alquiler)\s+mensual)\s*(?:[:=]|of)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)\b/gi,
    ],
  ];
  for (const [kind, pattern] of labels) {
    for (const match of safeText.matchAll(pattern)) {
      const cents = Math.round(Number(match[1].replaceAll(',', '')) * 100);
      if (!Number.isSafeInteger(cents) || cents < 0 || cents > 1_000_000_000) continue;
      result.push({
        ...anchor(safeText, match.index!, match.index! + match[0].length),
        cents,
        kind,
      });
    }
  }
  return result.sort((a, b) => a.start - b.start).slice(0, 80);
}

function extractPeople(text: string): PersonCandidate[] {
  const pattern =
    /^(?:employee|tenant|account\s+holder|emplead[oa]|inquilin[oa]|titular)\s*:\s*([^\r\n.;]{2,100})/gim;
  return [...text.matchAll(pattern)].slice(0, 20).map((match) => ({
    ...anchor(text, match.index!, match.index! + match[0].length),
    name: match[1].trim(),
  }));
}
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (const character of text.toLowerCase().replace(/\s+/g, ' ').trim()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return `text-fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

export function inspectDocumentText(text: string, model: DocumentModel): DocumentInsight {
  const safeText = String(text ?? '').slice(0, INPUT_LIMIT);
  return {
    version: 1,
    classification: classifyDocument(text, model),
    months: extractMonthCandidates(safeText),
    amounts: extractAmountCandidates(safeText),
    people: extractPeople(safeText),
    textFingerprint: fingerprint(safeText),
  };
}
