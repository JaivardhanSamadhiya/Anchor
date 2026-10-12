/**
 * Explainable paperwork checks over user-reviewed document facts. Matching a
 * request only means a candidate is present, never that it meets agency rules.
 * No facts, checklist statuses, deadlines, or forms are changed by this module.
 */
import type { ContinuityNotice, NoticeRequest } from './continuity.js';
import type { FormDraft } from './form-assistance.js';
import {
  extractMonthCandidates,
  validReportingMonth,
  type AmountKind,
  type DocumentInsight,
  type DocumentKind,
  type TextEvidence,
} from './document-intelligence.js';

export interface EvidenceDocument {
  id: string;
  name: string;
  noticeId?: string;
  requestIds?: string[];
  attachmentId?: string;
  text?: string;
  sha256?: string;
  insight?: DocumentInsight;
  confirmation?: {
    kind?: DocumentKind;
    month?: string;
    person?: string;
    amountCents?: number;
    amountKind?: AmountKind;
    amountBasis?: 'monthly' | 'per-payment';
    checked?: boolean;
  };
}
export type ReadinessCode =
  | 'missing-evidence'
  | 'unconfirmed-document'
  | 'wrong-reporting-month'
  | 'missing-reporting-month'
  | 'multiple-reporting-months'
  | 'amount-mismatch'
  | 'form-period-mismatch'
  | 'duplicate-file'
  | 'duplicate-text'
  | 'manual-request';
export interface ReadinessFinding {
  id: string;
  code: ReadinessCode;
  severity: 'attention' | 'review' | 'info';
  title: string;
  message: string;
  noticeId?: string;
  requestId?: string;
  documentIds: string[];
  source?: TextEvidence;
  fieldId?: string;
}
export interface RequestReadiness {
  noticeId: string;
  requestId: string;
  kind: DocumentKind;
  requiredMonth: string | null;
  documentIds: string[];
  status: 'missing' | 'needs-review' | 'matched';
  findingIds: string[];
}
export interface ReadinessResult {
  version: 1;
  findings: ReadinessFinding[];
  requests: RequestReadiness[];
  checkedDocuments: number;
  summary: {
    requirements: number;
    matched: number;
    needsReview: number;
    missing: number;
    duplicateGroups: number;
  };
}
export interface ReadinessInput {
  notices: ContinuityNotice[];
  documents: EvidenceDocument[];
  formDrafts?: FormDraft[];
  language?: 'en' | 'es';
}
const KINDS = new Set<DocumentKind>([
  'benefit-notice',
  'paystub',
  'rent-proof',
  'identity',
  'utility-bill',
  'unknown',
]);
const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Public UI copy has a reviewed Spanish equivalent; original evidence is unchanged. */
export function localizedReadinessFinding(
  finding: ReadinessFinding,
  language: 'en' | 'es',
): ReadinessFinding {
  if (language !== 'es') return finding;
  const months = finding.message.match(/\b(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])\b/g) ?? [];
  const copy: Record<ReadinessCode, [string, string]> = {
    'missing-evidence': [
      'No se seleccionó evidencia correspondiente',
      'Anchor no tiene un documento candidato para esta solicitud. Agregue la evidencia solicitada o anote una pregunta para la agencia; un archivo no disponible o ilegible puede necesitar revisión manual.',
    ],
    'unconfirmed-document': [
      'Confirme los datos del documento',
      'El modelo solo sugiere un tipo de documento. Revise el original y confirme el tipo, la persona y el período del reporte antes de usarlo en este paquete.',
    ],
    'missing-reporting-month': [
      'Confirme el mes del reporte',
      `La solicitud indica ${months[0] ?? 'un período'}, pero un documento seleccionado no tiene un mes verificado. La fecha de pago o de impresión no necesariamente es el período del reporte.`,
    ],
    'multiple-reporting-months': [
      'La solicitud incluye más de un mes',
      'Estas fechas pueden describir un intervalo o requisitos separados. Anchor no ha seleccionado un mes de reporte. Confirme el período con el aviso original o la agencia.',
    ],
    'wrong-reporting-month': [
      'La evidencia seleccionada corresponde a otro mes',
      `La solicitud indica ${months[0] ?? 'un período'}. Los meses verificados en los documentos seleccionados incluyen ${months.slice(1).join(', ') || 'otro período'}. Revise el período del reporte y pregunte a la agencia si esta evidencia corresponde.`,
    ],
    'amount-mismatch': [
      finding.fieldId === 'rent'
        ? 'Los montos de renta mensual son diferentes'
        : 'Los ingresos brutos mensuales verificados son diferentes',
      finding.fieldId === 'rent'
        ? 'El monto de renta mensual verificado en la evidencia difiere del campo de renta de este formulario. Confirme el período y qué incluye cada monto; Anchor no decide qué monto debe incluirse.'
        : 'Los ingresos brutos mensuales verificados para esta persona difieren de esta fila del formulario. Confirme si corresponden al mismo empleo y período. El pago neto y los pagos individuales no se usan en esta comparación.',
    ],
    'form-period-mismatch': [
      'El formulario y la solicitud indican meses diferentes',
      `El mes de reporte de su SAR 7 es ${months[0] ?? 'otro período'}; esta solicitud de evidencia indica ${months[1] ?? 'un período diferente'}. Pueden corresponder a pasos distintos. Revise el original antes de cambiar cualquiera.`,
    ],
    'duplicate-file': [
      'El mismo archivo fue seleccionado más de una vez',
      'Los archivos tienen hashes SHA-256 idénticos. Revise la selección del paquete; solicitudes separadas pueden usar la misma evidencia de manera intencional. Anchor no ha eliminado nada.',
    ],
    'duplicate-text': [
      'El mismo texto aparece en varios documentos',
      'El texto legible es idéntico después de normalizar espacios y mayúsculas. Las imágenes o firmas pueden ser diferentes. Compare los archivos originales antes de decidir cuáles incluir.',
    ],
    'manual-request': [
      'Revise esta solicitud con el original',
      'Esta solicitud no tiene una comparación de documentos compatible. Lea el texto resaltado y pregunte a la agencia qué evidencia corresponde.',
    ],
  };
  const [title, message] = copy[finding.code];
  return { ...finding, title, message };
}

/** Infer a preparation category from the actual requested wording, not boilerplate. */
export function requestDocumentKind(request: Pick<NoticeRequest, 'title' | 'quote'>): DocumentKind {
  const text = normalize(request.quote || request.title);
  if (
    /\b(?:pay\s*stubs?|pay\s*slips?|wages?|income|earnings|nomina|sueldo|salario|ingresos)\b/.test(
      text,
    )
  )
    return 'paystub';
  if (/\b(?:rent|rental|lease|housing\s+cost|mortgage|renta|alquiler|arrendamiento)\b/.test(text))
    return 'rent-proof';
  if (
    /\b(?:identit(?:y|ification)|driver\s*licen[sc]e|passport|identidad|identificacion|pasaporte)\b/.test(
      text,
    )
  )
    return 'identity';
  if (
    /\b(?:utility|utilities|electricity|water\s+bill|gas\s+bill|servicios\s+publicos|electricidad|factura\s+de\s+agua)\b/.test(
      text,
    )
  )
    return 'utility-bill';
  return 'unknown';
}
function documentKind(document: EvidenceDocument): DocumentKind {
  const confirmed = document.confirmation;
  if (confirmed?.checked === true && confirmed.kind && KINDS.has(confirmed.kind))
    return confirmed.kind;
  const suggestion = document.insight?.classification.kind;
  return suggestion && KINDS.has(suggestion) ? suggestion : 'unknown';
}
function requestSource(request: NoticeRequest): TextEvidence | undefined {
  if (typeof request.quote !== 'string') return undefined;
  return {
    quote: request.quote,
    start: Number.isInteger(request.start) ? request.start! : 0,
    end: Number.isInteger(request.end) ? request.end! : request.quote.length,
    line: Number.isInteger(request.line) ? request.line! : 1,
  };
}
function belongs(
  document: EvidenceDocument,
  notice: ContinuityNotice,
  request: NoticeRequest,
): boolean {
  if (document.noticeId && document.noticeId !== notice.id) return false;
  if (document.requestIds?.length) return document.requestIds.includes(request.id);
  return true;
}
function confirmedMonth(document: EvidenceDocument): string | null {
  return document.confirmation?.checked === true && validReportingMonth(document.confirmation.month)
    ? document.confirmation.month
    : null;
}
function formMonth(value: unknown): string | null {
  if (validReportingMonth(value)) return value;
  const months = new Set(
    extractMonthCandidates(String(value ?? '')).map((candidate) => candidate.month),
  );
  return months.size === 1 ? [...months][0] : null;
}
function moneyCents(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    !/^\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*$/.test(value)
  )
    return null;
  const amount = Math.round(Number(value.replace(/[$,\s]/g, '')) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null;
}
function validDocumentAmount(document: EvidenceDocument, kind: AmountKind): number | null {
  const fact = document.confirmation;
  return fact?.checked === true &&
    fact.amountKind === kind &&
    fact.amountBasis === 'monthly' &&
    Number.isSafeInteger(fact.amountCents) &&
    fact.amountCents! >= 0 &&
    fact.amountCents! <= 1_000_000_000
    ? fact.amountCents!
    : null;
}

export function evaluateEvidenceReadiness(input: ReadinessInput): ReadinessResult {
  const notices = (input.notices ?? []).slice(0, 200);
  const documents = (input.documents ?? [])
    .filter((document) => document && typeof document.id === 'string')
    .slice(0, 500);
  const drafts = (input.formDrafts ?? []).slice(0, 200);
  const findings: ReadinessFinding[] = [];
  const requests: RequestReadiness[] = [];
  const add = (finding: Omit<ReadinessFinding, 'id'>): string => {
    const id = `readiness-${findings.length + 1}`;
    findings.push({ id, ...finding });
    return id;
  };
  for (const notice of notices) {
    for (const request of (notice.requests ?? []).slice(0, 200)) {
      if (request.kind !== 'document') continue;
      const kind = requestDocumentKind(request);
      const monthCandidates = extractMonthCandidates(request.quote || request.title);
      const months = [...new Set(monthCandidates.map((candidate) => candidate.month))];
      const requiredMonth = months.length === 1 ? months[0] : null;
      const mentionsReportingPeriod =
        /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|reporting\s+period|report\s+month|mes\s+de\s+reporte|(?:last|previous|prior)\s+month|mes\s+(?:pasado|anterior))\b/i.test(
          request.quote || request.title,
        );
      const result: RequestReadiness = {
        noticeId: notice.id,
        requestId: request.id,
        kind,
        requiredMonth,
        documentIds: [],
        status: 'needs-review',
        findingIds: [],
      };
      requests.push(result);
      const source = requestSource(request);
      const issue = (
        code: ReadinessCode,
        severity: ReadinessFinding['severity'],
        title: string,
        message: string,
        candidates: EvidenceDocument[] = [],
        fieldId?: string,
      ) => {
        result.findingIds.push(
          add({
            code,
            severity,
            title,
            message,
            noticeId: notice.id,
            requestId: request.id,
            documentIds: candidates.map((document) => document.id),
            source,
            ...(fieldId ? { fieldId } : {}),
          }),
        );
      };
      if (!notice.supported || kind === 'unknown') {
        issue(
          'manual-request',
          'review',
          'Review this request with the original',
          'This request does not have a supported document comparison. Read the highlighted wording and ask the issuing agency which evidence applies.',
        );
        continue;
      }
      const candidates = documents.filter(
        (document) => belongs(document, notice, request) && documentKind(document) === kind,
      );
      result.documentIds = candidates.map((document) => document.id);
      if (!candidates.length) {
        result.status = 'missing';
        issue(
          'missing-evidence',
          'attention',
          'No matching evidence selected',
          'Anchor has no candidate document for this request. Add the requested evidence or record a question for the agency; an unavailable or unreadable file may need manual review.',
        );
        continue;
      }
      const unconfirmed = candidates.filter((document) => document.confirmation?.checked !== true);
      if (unconfirmed.length) {
        issue(
          'unconfirmed-document',
          'review',
          'Confirm the document details',
          'The document model only suggests a type. Check the original and confirm its type, person and reporting period before using it in this packet.',
          unconfirmed,
        );
      }
      if (months.length > 1) {
        issue(
          'multiple-reporting-months',
          'review',
          'More than one month appears in the request',
          'These dates may describe a range or separate requirements. Anchor has not selected one reporting month. Confirm the period with the original notice or agency.',
          candidates,
        );
      } else if (requiredMonth) {
        const missingMonth = candidates.filter(
          (document) => document.confirmation?.checked === true && !confirmedMonth(document),
        );
        if (missingMonth.length)
          issue(
            'missing-reporting-month',
            'review',
            'Confirm the reporting month',
            `The request names ${requiredMonth}, but a selected document has no checked reporting month. A payment or print date is not necessarily the reporting period.`,
            missingMonth,
          );
        const wrong = candidates.filter(
          (document) => confirmedMonth(document) && confirmedMonth(document) !== requiredMonth,
        );
        if (wrong.length)
          issue(
            'wrong-reporting-month',
            'attention',
            'Selected evidence covers a different month',
            `The request names ${requiredMonth}. The checked month on ${wrong.length === 1 ? 'this document is' : 'these documents includes'} ${[...new Set(wrong.map((document) => confirmedMonth(document)))].join(', ')}. Review the reporting period and ask the agency whether this evidence applies.`,
            wrong,
          );
      } else if (mentionsReportingPeriod) {
        issue(
          'missing-reporting-month',
          'review',
          'Confirm the requested reporting period',
          'The request refers to a month or reporting period without one unambiguous month and year. Anchor has not borrowed the notice or payment date. Check the original or ask the agency which period applies.',
          candidates,
        );
      }
      for (const draft of drafts.filter(
        (item) =>
          item.noticeId === notice.id &&
          (!item.requestId ||
            item.requestId === request.id ||
            notice.requests.some((r) => r.id === item.requestId && r.kind === 'form')),
      )) {
        const answers = draft.answers ?? {};
        const reportMonth = draft.formId === 'sar7b' ? formMonth(answers.reportMonth) : null;
        if (requiredMonth && reportMonth && reportMonth !== requiredMonth) {
          issue(
            'form-period-mismatch',
            'attention',
            'Form and request name different months',
            `Your SAR 7 report month is ${reportMonth}; this evidence request names ${requiredMonth}. They may serve different steps. Check the original before changing either.`,
            candidates,
            'reportMonth',
          );
        }
        // Arithmetic is meaningful only for a known shared reporting period.
        // SAR 7 supplies its own report month; an undated generic proof request
        // can use that month, but cannot override a conflicting/unclear request.
        // CF 37 has no report-month field, so it needs an explicit notice month.
        const unclearRequestPeriod =
          months.length > 1 || (!requiredMonth && mentionsReportingPeriod);
        const comparisonMonth = unclearRequestPeriod
          ? null
          : draft.formId === 'sar7b'
            ? reportMonth && (!requiredMonth || reportMonth === requiredMonth)
              ? reportMonth
              : null
            : draft.formId === 'cf37'
              ? requiredMonth
              : null;
        if (!comparisonMonth) continue;
        if (kind === 'rent-proof') {
          const matched = candidates.filter(
            (document) =>
              confirmedMonth(document) === comparisonMonth &&
              validDocumentAmount(document, 'rent') !== null,
          );
          const amount = moneyCents(answers.rent);
          if (
            matched.length === 1 &&
            amount !== null &&
            amount !== validDocumentAmount(matched[0], 'rent')
          ) {
            issue(
              'amount-mismatch',
              'attention',
              'Monthly rent amounts differ',
              'The monthly rent amount you checked on the selected evidence differs from the rent field in this form. Confirm the period and what each amount includes; Anchor does not decide which amount belongs on the form.',
              matched,
              'rent',
            );
          }
        }
        if (kind === 'paystub') {
          const prefix = draft.formId === 'cf37' ? 'job' : draft.formId === 'sar7b' ? 'income' : '';
          if (!prefix) continue;
          // A single paystub must never be compared to a monthly total by assuming
          // weekly/biweekly frequency, or by combining different household members.
          for (let row = 1; row <= 4; row++) {
            const person = normalize(answers[`${prefix}${row}Name`]);
            const amount = moneyCents(answers[`${prefix}${row}Gross`]);
            if (!person || amount === null) continue;
            const matched = candidates.filter(
              (document) =>
                normalize(document.confirmation?.person) === person &&
                confirmedMonth(document) === comparisonMonth &&
                validDocumentAmount(document, 'gross-income') !== null,
            );
            // Multiple jobs or partial records require resident review; no guessed sum.
            if (
              matched.length === 1 &&
              amount !== validDocumentAmount(matched[0], 'gross-income')
            ) {
              issue(
                'amount-mismatch',
                'attention',
                'Checked monthly gross amounts differ',
                'The checked monthly gross income for this person differs from this form row. Confirm whether the amounts cover the same job and period. Net pay and individual payments are not used in this comparison.',
                matched,
                `${prefix}${row}Gross`,
              );
            }
          }
        }
      }
      result.status = result.findingIds.length ? 'needs-review' : 'matched';
    }
  }

  const duplicateGroups: EvidenceDocument[][] = [];
  const hashes = new Map<string, EvidenceDocument[]>();
  const texts = new Map<string, EvidenceDocument[]>();
  for (const document of documents) {
    if (document.sha256 && /^[a-f0-9]{64}$/i.test(document.sha256)) {
      const key = document.sha256.toLowerCase();
      hashes.set(key, [...(hashes.get(key) ?? []), document]);
    } else if (document.text) {
      const key = normalize(document.text);
      if (key.length >= 80) texts.set(key, [...(texts.get(key) ?? []), document]);
    }
  }
  for (const group of hashes.values()) {
    if (group.length < 2) continue;
    duplicateGroups.push(group);
    add({
      code: 'duplicate-file',
      severity: 'info',
      title: 'Same file selected more than once',
      message:
        'These files have identical SHA-256 content hashes. Review the packet selection; separate requests may intentionally use the same evidence. Anchor has not removed anything.',
      documentIds: group.map((document) => document.id),
    });
  }
  for (const group of texts.values()) {
    if (group.length < 2) continue;
    duplicateGroups.push(group);
    add({
      code: 'duplicate-text',
      severity: 'info',
      title: 'Same extracted text in multiple documents',
      message:
        'The readable text is identical after spacing and case are normalized. Images or signatures may differ. Compare the original files before choosing what to include.',
      documentIds: group.map((document) => document.id),
    });
  }
  return {
    version: 1,
    findings: findings.map((finding) => localizedReadinessFinding(finding, input.language ?? 'en')),
    requests,
    checkedDocuments: documents.filter((document) => document.confirmation?.checked === true)
      .length,
    summary: {
      requirements: requests.length,
      matched: requests.filter((request) => request.status === 'matched').length,
      needsReview: requests.filter((request) => request.status === 'needs-review').length,
      missing: requests.filter((request) => request.status === 'missing').length,
      duplicateGroups: duplicateGroups.length,
    },
  };
}
