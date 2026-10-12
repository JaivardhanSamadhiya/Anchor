/**
 * Anchor's intentionally small, explainable notice adapter.
 * It recognizes a supported family, then extracts explicit statements with exact
 * source spans. It does not calculate legal deadlines or decide eligibility.
 * PDF text cannot establish whether a printed square was checked.
 */

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH_PATTERN =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const SPANISH_DATE = `\\d{1,2}\\s+de\\s+(?:${SPANISH_MONTHS.join('|')})\\s+de\\s+\\d{2,4}`;
const DATE_PATTERN = `\\b(?:${SPANISH_DATE}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?)\\b`;
const SELECTED = /^(?:\[[xX✓✔]\]|☑|☒)\s*/u;
const UNSELECTED = /^(?:\[\s*\]|☐)\s*/u;
const UNCERTAIN_BOX = /^(?:[■□▣▪◼◻]|\[\?\])\s*/u;
const TYPE_TITLES = {
  renewal: 'CalFresh renewal',
  verification: 'CalFresh information request',
  interview: 'CalFresh interview',
  unknown: 'Notice needs manual review',
};
const DEADLINE_LABELS = {
  submit: 'Submit requested items',
  interview: 'Interview date',
  end: 'Certification or benefits end',
};

function unique(values) {
  return [...new Set(values)];
}
function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function validISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isoFromParts(year, month, day) {
  if (!year || String(year).length !== 4) return null;
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return validISO(value) ? value : null;
}

function parseDate(raw) {
  const spanish = raw.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{2,4})$/i);
  if (spanish) {
    const date = isoFromParts(
      spanish[3],
      SPANISH_MONTHS.indexOf(spanish[2].toLowerCase()) + 1,
      spanish[1],
    );
    return {
      date,
      needsReview: !date,
      issue: date ? null : 'Verifica la fecha y el año completo en el aviso original.',
    };
  }
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const date = isoFromParts(match[1], match[2], match[3]);
    return {
      date,
      needsReview: !date,
      issue: date ? null : 'The date is not a valid calendar date.',
    };
  }
  match = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (match) {
    if (!match[3] || match[3].length !== 4)
      return {
        date: null,
        needsReview: true,
        issue: 'The date needs a full four-digit year; Anchor will not guess it.',
      };
    const month = Number(match[1]),
      day = Number(match[2]);
    const date = isoFromParts(match[3], month, day);
    const ambiguous = month <= 12 && day <= 12 && month !== day;
    return {
      date,
      needsReview: !date || ambiguous,
      issue: !date
        ? 'The numeric date is invalid or may use a different date order.'
        : ambiguous
          ? 'Confirm the month/day order of this numeric date against the original notice.'
          : null,
    };
  }
  match = raw.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?$/i);
  if (match) {
    if (!match[3] || match[3].length !== 4)
      return {
        date: null,
        needsReview: true,
        issue: 'The date needs a full four-digit year; Anchor will not guess it.',
      };
    const prefix = match[1].toLowerCase().slice(0, 3);
    const month = MONTHS.findIndex((name) => name.startsWith(prefix)) + 1;
    const date = isoFromParts(match[3], month, Number(match[2]));
    return {
      date,
      needsReview: !date,
      issue: date ? null : 'The date is not a valid calendar date.',
    };
  }
  return { date: null, needsReview: true, issue: 'Anchor could not safely read this date.' };
}

function sourceLines(text) {
  const lines = [];
  const expression = /([^\r\n]*)(?:\r\n|\n|\r|$)/g;
  let match;
  while ((match = expression.exec(text))) {
    if (!match[0] && match.index === text.length) break;
    const leading = match[1].length - match[1].trimStart().length;
    const quote = match[1].trim();
    lines.push({
      quote,
      line: lines.length + 1,
      start: match.index + leading,
      end: match.index + leading + quote.length,
    });
  }
  return lines;
}

function datesIn(text) {
  const expression = new RegExp(DATE_PATTERN, 'gi');
  return [...text.matchAll(expression)].map((match) => ({
    raw: match[0],
    index: match.index,
    ...parseDate(match[0]),
  }));
}

function sentenceBefore(text, position) {
  const prefix = text.slice(0, position);
  // Do not split a decimal, a dotted form number, or a month abbreviation.
  const parts = prefix.split(
    /[!?;]\s*|(?<!\bJan|\bFeb|\bMar|\bApr|\bJun|\bJul|\bAug|\bSep|\bOct|\bNov|\bDec)\.\s+/i,
  );
  return parts.at(-1) || prefix;
}

function deadlineKind(context) {
  // Conditional possibilities and rules are not case-specific dates.
  if (
    /\b(?:if|for example|example|such as|may|might|could|can|si|por ejemplo|puede|podr[ií]a)\b/i.test(
      context,
    )
  )
    return null;
  const cues = [
    {
      kind: 'end',
      regex:
        /\b(?:certification(?:\s+period)?|benefits?|coverage)\b[^.!?;]*?\b(?:will\s+end|ends?|expire[sd]?|stop[sp]?|will\s+stop|terminat\w*)\b|\b(?:end\s+of\s+(?:your\s+)?certification|certification\s+end(?:\s+date)?)\b/gi,
    },
    {
      kind: 'interview',
      regex:
        /\binterview\b[^.!?;]*?\b(?:scheduled|appointment|date|on|for|at)\b|\bappointment\s+(?:date|on|for)\b/gi,
    },
    {
      kind: 'submit',
      regex:
        /\b(?:submit|return|provide|send|turn\s+in|file|complete|received?|due|deadline)\b[^.!?;]*?\b(?:by|before|no\s+later\s+than|on|date|:)\b|\b(?:due\s+date|submission\s+deadline|deadline)\s*:/gi,
    },
  ];
  const matches = [];
  // Spanish statements are read directly; offsets and quotations never pass
  // through a translation model or a normalized replacement of the source.
  for (const [kind, regex] of [
    [
      'end',
      /(?:certificaci[oó]n|beneficios|cobertura)[^.!?;]*?(?:termina|vence|finaliza|se suspende)/gi,
    ],
    ['interview', /(?:entrevista|cita)[^.!?;]*?(?:programada|fecha|el|para)/gi],
    [
      'submit',
      /(?:enviar|env[ií]e|entregar|entregue|devolver|devuelva|presentar|presente|proporcionar|proporcione|recibir|recibirse|completar|complete)[^.!?;]*?(?:antes de|a m[aá]s tardar|para el|el)|fecha l[ií]mite\s*:/gi,
    ],
  ])
    for (const match of context.matchAll(regex)) matches.push({ kind, index: match.index });
  for (const cue of cues) {
    for (const match of context.matchAll(cue.regex))
      matches.push({ kind: cue.kind, index: match.index });
  }
  return matches.sort((a, b) => b.index - a.index)[0]?.kind || null;
}

function isBoilerplate(text) {
  const statement = text
    .replace(SELECTED, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[•*\-]\s*/, '')
    .trim();
  // An example appended to a definite request is still part of that request.
  // "Proof of rent, such as ..." differs from "For example, you can ...".
  return (
    /^(?:if\b|for\s+example\b|such\s+as\b|(?:you\s+)?(?:may|might|could|can)\b|you\s+have\s+the\s+right\b|do\s+not\s+(?:send|submit|provide|return)\b)/i.test(
      statement,
    ) ||
    /^(?:si\b|por ejemplo\b|puede\b|podr[ií]a\b|no\s+(?:env[ií]e|entregue|presente|proporcione)|tiene derecho\b)/i.test(
      statement,
    ) ||
    /\b(?:not\s+required|hearing\s+rights|appeal\s+rights|no se requiere|derechos de audiencia)\b/i.test(
      statement,
    )
  );
}

function requestKind(text) {
  if (/\b(?:interview|entrevista)\b/i.test(text)) return 'interview';
  if (
    /\b(?:renewal|recertification|application)\s+form\b|formulario de (?:renovaci[oó]n|recertificaci[oó]n|solicitud)|\b(?:SAR\s*7|CF\s*37)\b/i.test(
      text,
    )
  )
    return 'form';
  if (
    /\b(?:pay\s*stubs?|pay\s*slips?|proof|verification|statement|lease|rent|income|identity|identification|document|letter|records?|receipts?|birth\s+certificate|utility\s+bill|comprobantes?|ingresos|alquiler|renta|documentos?|identidad|recibos|talones|verificaci[oó]n)\b/i.test(
      text,
    )
  )
    return 'document';
  return 'submit';
}

function requestTitle(text, kind) {
  const cleaned = text
    .replace(SELECTED, '')
    .replace(/^[•*\-]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
  if (kind === 'interview') return 'Complete the interview described in this notice';
  if (kind === 'form') return 'Complete and return the requested form';
  if (kind === 'document') return cleaned.length <= 100 ? cleaned : `${cleaned.slice(0, 97)}…`;
  return cleaned.length <= 100 ? cleaned : `${cleaned.slice(0, 97)}…`;
}

// Translate only Anchor's guidance. Quotes and offsets always keep the exact
// agency wording so Spanish review has the same evidence trail as English.
function localizeNotice(result) {
  if (result.language !== 'es') return result;
  const copy = {
    'No readable notice text was found. Paste the text or use a readable text-based PDF.':
      'No se encontró texto legible. Pega el texto o utiliza un PDF legible con texto.',
    'Multiple form codes were found. Add each notice separately; Anchor cannot safely combine them.':
      'Se encontraron varios códigos de formulario. Agrega cada aviso por separado; Anchor no puede combinarlos con seguridad.',
    'This notice is outside the supported CalFresh notice types. Read the original and contact the issuing agency; no action plan has been inferred.':
      'Este aviso no corresponde a los tipos de CalFresh compatibles. Lee el original y contacta a la agencia; no se ha generado un plan.',
    'More than one county is named. Verify which county issued this notice.':
      'Se menciona más de un condado. Verifica cuál emitió el aviso.',
    'Conflicting notice dates were found; no notice date was chosen.':
      'Se encontraron fechas del aviso contradictorias; no se eligió una fecha.',
    'Verify the notice date, including its year and date order, against the original.':
      'Verifica la fecha del aviso, el año y el orden de la fecha en el original.',
    'A square or unclear checkbox appears in extracted text. Compare the original before treating any option as selected.':
      'El texto contiene una casilla o marca poco clara. Compara el original antes de considerar una opción seleccionada.',
    'A relative renewal filing rule needs review. Anchor has not calculated a date from the certification end date.':
      'La regla de plazo relativo de renovación necesita revisión. Anchor no calculó una fecha a partir del fin de certificación.',
    'A relative deadline needs agency or user review. Anchor has not calculated a date from it.':
      'El plazo relativo necesita revisión del usuario o la agencia. Anchor no calculó una fecha.',
    'A selected option could not be understood as an evidence or action request. Review the original.':
      'No se pudo interpretar una opción marcada como solicitud de comprobante o acción. Revisa el original.',
    'An action contains an unfilled field. Review the original; Anchor has not guessed the missing details.':
      'Una acción contiene un campo vacío. Revisa el original; Anchor no adivinó los datos faltantes.',
    'No explicit case-specific deadline was safely recognized. Check the original and ask the issuing agency if anything is due.':
      'No se reconoció con seguridad un plazo explícito de tu caso. Revisa el original y pregunta a la agencia si hay una fecha límite.',
    'No definite requested action or clearly selected evidence was safely recognized. Unmarked examples are not treated as requirements.':
      'No se reconoció con seguridad una acción definida o comprobante claramente seleccionado. Los ejemplos sin marcar no son requisitos.',
    'The issuing county was not established. Verify its name on the original notice.':
      'No se estableció el condado emisor. Verifica su nombre en el aviso original.',
    'The date is not a valid calendar date.': 'La fecha no es válida en el calendario.',
    'The date needs a full four-digit year; Anchor will not guess it.':
      'La fecha necesita el año completo de cuatro dígitos; Anchor no lo adivina.',
    'The numeric date is invalid or may use a different date order.':
      'La fecha numérica no es válida o utiliza otro orden.',
    'Confirm the month/day order of this numeric date against the original notice.':
      'Verifica el orden mes/día de esta fecha numérica en el aviso original.',
    'Anchor could not safely read this date.': 'Anchor no pudo leer esta fecha con seguridad.',
    'Complete the interview described in this notice':
      'Completa la entrevista descrita en este aviso',
    'Complete and return the requested form': 'Completa y entrega el formulario solicitado',
    'To renew, complete the application steps described here':
      'Para renovar, completa los pasos de solicitud descritos aquí',
    'This instruction applies if you choose to renew. Read the original for the application and interview steps; unmarked evidence examples are not individual document requirements.':
      'Esta instrucción corresponde si decides renovar. Lee el original para los pasos de solicitud y entrevista; los ejemplos sin marcar no son requisitos individuales.',
    'This action comes from the highlighted notice text. Verify the original before completing it.':
      'Esta acción proviene del texto resaltado del aviso. Verifica el original antes de completarla.',
    'Submit requested items': 'Entrega los documentos solicitados',
    'Interview date': 'Fecha de entrevista',
    'Certification or benefits end': 'Fin de certificación o beneficios',
    'Renewal filing rule — verify the exact date':
      'Regla de plazo de renovación — verifica la fecha exacta',
    'Renewal application date': 'Fecha de solicitud de renovación',
    'Relative deadline — verify the exact date': 'Plazo relativo — verifica la fecha exacta',
  };
  result.warnings = result.warnings.map(
    (text) =>
      copy[text] ||
      (/^Different .* dates appear in this notice\./.test(text)
        ? 'Este aviso contiene fechas distintas para el mismo tipo de acción. Pueden ser pasos diferentes; confirma cada fecha con la agencia.'
        : text),
  );
  for (const request of result.requests) {
    request.title = copy[request.title] || request.title;
    request.description = copy[request.description] || request.description;
  }
  for (const deadline of result.deadlines) deadline.label = copy[deadline.label] || deadline.label;
  return result;
}

/** Exact offsets are into sourceText, without normalizing whitespace or newlines. */
export function analyzeNotice(text, options = {}) {
  const sourceText = typeof text === 'string' ? text : '';
  const id = String(options.id || makeId());
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const result = {
    id,
    filename: String(options.filename || 'Pasted notice'),
    sourceText,
    program: 'Unknown',
    formCode: null,
    type: 'unknown',
    title: TYPE_TITLES.unknown,
    supported: false,
    county: 'unknown',
    noticeDate: null,
    deadlines: [],
    requests: [],
    warnings: [],
    createdAt: Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString(),
    isDemo: options.isDemo === true,
    language:
      /fecha del aviso|documentos solicitados|su entrevista|aviso de|ingresos|renovaci[oó]n|solicitud|proporcione|recertificaci[oó]n/i.test(
        sourceText,
      )
        ? 'es'
        : 'en',
  };
  if (!sourceText.trim()) {
    result.warnings.push(
      'No readable notice text was found. Paste the text or use a readable text-based PDF.',
    );
    return localizeNotice(result);
  }
  const lines = sourceLines(sourceText);
  const codes = unique(
    [...sourceText.matchAll(/\bCF\s*(\d{3})(?:\s*[._]\s*(\d+[A-Z]*))?\b/gi)].map(
      (match) => `CF${match[1]}${match[2] ? `.${match[2].toUpperCase()}` : ''}`,
    ),
  );
  const recognized = codes.filter((code) => code === 'CF377.2' || code === 'CF377.6');
  const explicitCalFresh = /\bCal\s*Fresh\b/i.test(sourceText);
  result.program = explicitCalFresh || recognized.length ? 'CalFresh' : 'Unknown';
  result.formCode = codes.length === 1 ? codes[0] : null;
  const explicitInterview =
    explicitCalFresh &&
    /\b(?:interview\s+appointment|interview\s+(?:is\s+)?scheduled|your\s+(?:CalFresh\s+)?interview\s+(?:date|is\s+on)|su entrevista|cita de entrevista)\b/i.test(
      sourceText,
    );
  if (codes.length > 1) {
    result.warnings.push(
      'Multiple form codes were found. Add each notice separately; Anchor cannot safely combine them.',
    );
  } else if (result.formCode === 'CF377.2') {
    result.type = 'renewal';
    result.supported = true;
  } else if (result.formCode === 'CF377.6') {
    result.type = 'verification';
    result.supported = true;
  } else if (!codes.length && explicitInterview) {
    result.type = 'interview';
    result.supported = true;
  } else {
    result.warnings.push(
      'This notice is outside the supported CalFresh notice types. Read the original and contact the issuing agency; no action plan has been inferred.',
    );
  }
  result.title = TYPE_TITLES[result.type];
  if (result.language === 'es')
    result.title = {
      renewal: 'Renovación de CalFresh',
      verification: 'Solicitud de información de CalFresh',
      interview: 'Entrevista de CalFresh',
      unknown: 'Aviso por revisar',
    }[result.type];
  const counties = [];
  if (/\bSanta\s+Clara\b/i.test(sourceText)) counties.push('santa-clara');
  if (/\bSan\s+Mateo\b/i.test(sourceText)) counties.push('san-mateo');
  if (counties.length === 1) result.county = counties[0];
  else if (counties.length > 1)
    result.warnings.push('More than one county is named. Verify which county issued this notice.');
  else if (['santa-clara', 'san-mateo'].includes(options.county)) result.county = options.county;

  const noticeDates = [];
  for (let index = 0; index < lines.length; index++) {
    const current = lines[index];
    if (!/\bnotice\s+date\s*:|fecha del aviso\s*:/i.test(current.quote)) continue;
    let found = datesIn(current.quote.split(/\bnotice\s+date\s*:|fecha del aviso\s*:/i).at(-1));
    if (!found.length && lines[index + 1] && /^\s*$/.test(current.quote.split(':').at(-1))) {
      const nextDates = datesIn(lines[index + 1].quote);
      if (nextDates.length === 1 && lines[index + 1].quote === nextDates[0].raw) found = nextDates;
    }
    noticeDates.push(...found);
  }
  const validNoticeDates = unique(noticeDates.filter((date) => date.date).map((date) => date.date));
  if (validNoticeDates.length === 1) result.noticeDate = validNoticeDates[0];
  if (validNoticeDates.length > 1)
    result.warnings.push('Conflicting notice dates were found; no notice date was chosen.');
  if (noticeDates.some((date) => date.needsReview))
    result.warnings.push(
      'Verify the notice date, including its year and date order, against the original.',
    );
  if (!result.supported) return localizeNotice(result);

  let requestSection = false;
  for (let index = 0; index < lines.length; index++) {
    const source = lines[index];
    const value = source.quote;
    if (!value) {
      requestSection = false;
      continue;
    }
    const selected = SELECTED.test(value);
    const unselected = UNSELECTED.test(value);
    const uncertainBox = UNCERTAIN_BOX.test(value);
    if (uncertainBox)
      result.warnings.push(
        'A square or unclear checkbox appears in extracted text. Compare the original before treating any option as selected.',
      );
    if (unselected || uncertainBox) continue;
    // The standard renewal notice phrases the application step conditionally:
    // retaining benefits is the resident's choice. Keep that intent in the task
    // label and keep its relative deadline unresolved, even with a known end date.
    if (
      result.type === 'renewal' &&
      /\bif\s+you\s+(?:want|wish)\s+to\s+(?:keep\s+getting|continue\s+(?:receiving|getting)|renew)\b/i.test(
        value,
      )
    ) {
      const continuation = lines.slice(index, index + 3);
      const blockEnd = continuation.findIndex(
        (entry, offset) =>
          offset > 0 &&
          (!entry.quote || /^(?:\d+[.)]\s|important\s+rules|rules\s*:)/i.test(entry.quote)),
      );
      const blockLines = blockEnd < 0 ? continuation : continuation.slice(0, blockEnd);
      const last = blockLines.at(-1);
      const quote = sourceText.slice(source.start, last.end);
      if (
        /\byou\s+must\s+(?:file|submit|complete|return)\s+(?:an?\s+|the\s+|your\s+)?(?:application|renewal|recertification)\b/i.test(
          quote,
        )
      ) {
        const anchor = { quote, line: source.line, start: source.start, end: last.end };
        result.requests.push({
          id: `${id}-request-${source.start}`,
          title: 'To renew, complete the application steps described here',
          description:
            'This instruction applies if you choose to renew. Read the original for the application and interview steps; unmarked evidence examples are not individual document requirements.',
          ...anchor,
          status: 'todo',
          kind: 'form',
        });
        const relative = quote.match(/\b\d{1,2}(?:st|nd|rd|th)\s+day\s+of\s+[^.;]+/i);
        if (relative) {
          result.deadlines.push({
            id: `${id}-relative-${source.start}`,
            label: 'Renewal filing rule — verify the exact date',
            date: null,
            raw: relative[0],
            ...anchor,
            kind: 'submit',
            needsReview: true,
            confirmed: false,
          });
          result.warnings.push(
            'A relative renewal filing rule needs review. Anchor has not calculated a date from the certification end date.',
          );
        }
        for (const date of datesIn(quote)) {
          if (!/\b(?:by|before|no\s+later\s+than)\s*$/i.test(quote.slice(0, date.index))) continue;
          result.deadlines.push({
            id: `${id}-date-${source.start + date.index}`,
            label: 'Renewal application date',
            date: date.date,
            raw: date.raw,
            ...anchor,
            kind: 'submit',
            needsReview: date.needsReview,
            confirmed: false,
          });
          if (date.issue) result.warnings.push(date.issue);
        }
      }
      continue;
    }
    if (
      /^(?:requested\s+(?:items|documents|information)|items\s+(?:you\s+must\s+provide|requested)|you\s+must\s+provide|documentos solicitados|informaci[oó]n solicitada|debe proporcionar)\s*:\s*$/i.test(
        value,
      )
    ) {
      requestSection = true;
      continue;
    }
    if (
      /^(?:important\s+rules|rules\s*:|your\s+hearing\s+rights|hearing\s+request|other\s+information|worker\s+name\s*:|CF\s*377)/i.test(
        value,
      )
    )
      requestSection = false;

    if (!/\bnotice\s+date\s*:|fecha del aviso\s*:/i.test(value) && !isBoilerplate(value)) {
      const found = datesIn(value);
      for (const date of found) {
        let context = sentenceBefore(value, date.index);
        let kind = deadlineKind(context);
        if (
          !kind &&
          index > 0 &&
          date.index === 0 &&
          !UNSELECTED.test(lines[index - 1].quote) &&
          !UNCERTAIN_BOX.test(lines[index - 1].quote)
        ) {
          context = lines[index - 1].quote;
          kind = deadlineKind(context);
        }
        if (!kind) continue;
        const anchor =
          date.index === 0 && context === lines[index - 1]?.quote
            ? {
                quote: sourceText.slice(lines[index - 1].start, source.end),
                line: lines[index - 1].line,
                start: lines[index - 1].start,
                end: source.end,
              }
            : source;
        result.deadlines.push({
          id: `${id}-date-${source.start + date.index}`,
          label: DEADLINE_LABELS[kind],
          date: date.date,
          raw: date.raw,
          ...anchor,
          kind,
          needsReview: date.needsReview,
          confirmed: false,
        });
        if (date.issue) result.warnings.push(date.issue);
      }
      // These are source-backed review items, never computed dates.
      const relative = value.match(
        /\b(?:within\s+\d+\s+(?:calendar\s+|business\s+)?days?|(?:\d{1,2})(?:st|nd|rd|th)\s+day\s+of\s+[^.;]+|before\s+the\s+end\s+of\s+[^.;]+|dentro de \d+ d[ií]as)/i,
      );
      if (
        relative &&
        /\b(?:submit|return|provide|turn\s+in|file|complete|due|application|env[ií]e|entregue|presente|proporcione|complete)\b/i.test(
          value,
        )
      ) {
        result.deadlines.push({
          id: `${id}-relative-${source.start}`,
          label: 'Relative deadline — verify the exact date',
          date: null,
          raw: relative[0],
          ...source,
          kind: 'submit',
          needsReview: true,
          confirmed: false,
        });
        result.warnings.push(
          'A relative deadline needs agency or user review. Anchor has not calculated a date from it.',
        );
      }
    }

    const directRequest =
      /\b(?:please\s+(?:submit|return|provide|send|bring|complete)|you\s+must\s+(?:submit|return|provide|send|bring|file|complete)|we\s+(?:need|request)\s+(?:your|the)|submit\s+(?:your|the)|return\s+(?:your|the)|provide\s+(?:your|proof)|bring\s+(?:your|proof)|por favor (?:env[ií]e|entregue|presente|proporcione|complete)|debe (?:enviar|entregar|presentar|proporcionar|completar))\b/i.test(
        value,
      );
    const definiteInterview =
      /\byour\s+(?:CalFresh\s+)?interview\s+(?:is\s+(?:scheduled|on)|date|appointment)\b/i.test(
        value,
      ) || /^interview\s+(?:date|appointment)\s*:/i.test(value);
    const sectionItem = requestSection && /^(?:[•*\-]|\d+[.)])\s+/.test(value);
    const hasBlank = /_{3,}|\.{4,}/.test(value);
    if (
      !isBoilerplate(value) &&
      !hasBlank &&
      (selected || directRequest || definiteInterview || sectionItem)
    ) {
      const kind = requestKind(value);
      // A selected option without an action or evidence label is not a request.
      if (selected && !directRequest && !definiteInterview && kind === 'submit') {
        result.warnings.push(
          'A selected option could not be understood as an evidence or action request. Review the original.',
        );
        continue;
      }
      result.requests.push({
        id: `${id}-request-${source.start}`,
        title: requestTitle(value, kind),
        description:
          'This action comes from the highlighted notice text. Verify the original before completing it.',
        ...source,
        status: 'todo',
        kind,
      });
    } else if (hasBlank && (directRequest || selected)) {
      result.warnings.push(
        'An action contains an unfilled field. Review the original; Anchor has not guessed the missing details.',
      );
    }
  }

  for (const kind of ['submit', 'interview', 'end']) {
    const group = result.deadlines.filter((deadline) => deadline.kind === kind && deadline.date);
    const different = unique(group.map((deadline) => deadline.date));
    if (different.length > 1) {
      group.forEach((deadline) => {
        deadline.needsReview = true;
      });
      result.warnings.push(
        `Different ${kind === 'end' ? 'benefit-end' : kind} dates appear in this notice. They may describe different steps; confirm each with the issuing agency.`,
      );
    }
  }
  if (!result.deadlines.length)
    result.warnings.push(
      'No explicit case-specific deadline was safely recognized. Check the original and ask the issuing agency if anything is due.',
    );
  if (!result.requests.length)
    result.warnings.push(
      'No definite requested action or clearly selected evidence was safely recognized. Unmarked examples are not treated as requirements.',
    );
  if (result.county === 'unknown')
    result.warnings.push(
      'The issuing county was not established. Verify its name on the original notice.',
    );
  result.warnings = unique(result.warnings);
  return localizeNotice(result);
}

function normalizeRequest(request) {
  return String(request.quote || request.title || '')
    .toLowerCase()
    .replace(SELECTED, '')
    .replace(/^\s*[•*\-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Advisory comparisons only: notices never silently supersede one another. */
export function reconcileNotices(notices = []) {
  const usable = Array.isArray(notices)
    ? notices.filter((notice) => notice?.supported && notice.program === 'CalFresh')
    : [];
  const findings = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const first = usable[i],
        second = usable[j];
      // Cross-county notices may belong to separate cases; avoid a false conflict.
      if (
        first.county !== 'unknown' &&
        second.county !== 'unknown' &&
        first.county !== second.county
      )
        continue;
      for (const kind of ['submit', 'interview', 'end']) {
        const a = unique(
          (first.deadlines || [])
            .filter((deadline) => deadline.kind === kind && validISO(deadline.date))
            .map((deadline) => deadline.date),
        );
        const b = unique(
          (second.deadlines || [])
            .filter((deadline) => deadline.kind === kind && validISO(deadline.date))
            .map((deadline) => deadline.date),
        );
        // Same notice family gives stronger reason to inspect the difference.
        if (
          first.type === second.type &&
          a.length &&
          b.length &&
          (a.some((date) => !b.includes(date)) || b.some((date) => !a.includes(date)))
        ) {
          findings.push({
            id: `compare-${first.id}-${second.id}-${kind}`,
            title: 'Different dates — check both originals',
            description: `These notices list different ${kind === 'end' ? 'benefit-end' : kind} dates (${a.join(', ')} and ${b.join(', ')}). They may describe separate steps or cases. Ask the issuing agency which actions apply; neither notice has been marked as replaced.`,
            noticeIds: [first.id, second.id],
            kind: 'deadline-conflict',
          });
        }
      }
      const duplicate = unique(
        (first.requests || [])
          .map(normalizeRequest)
          .filter(
            (value) =>
              value &&
              (second.requests || []).some((request) => normalizeRequest(request) === value),
          ),
      );
      if (duplicate.length)
        findings.push({
          id: `duplicate-${first.id}-${second.id}`,
          title: 'Similar requested evidence',
          description:
            'Both notices contain the same request wording. You may be able to prepare the evidence once; check the person, period, and submission instructions on each notice. This does not establish agency acceptance.',
          noticeIds: [first.id, second.id],
          kind: 'duplicate-request',
        });
    }
  }
  return findings;
}

export function formatDate(iso, lang = 'en') {
  if (!validISO(iso)) return 'Date needs review';
  const [year, month, day] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return iso;
  }
}

function dayInLosAngeles(now) {
  if (typeof now === 'string' && validISO(now)) return now;
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Calendar-day difference in the app's local service region, including DST. */
export function daysUntil(iso, now = new Date()) {
  const today = dayInLosAngeles(now);
  if (!validISO(iso) || !validISO(today)) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function escapeCalendar(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldCalendarLine(value) {
  const encoder = new TextEncoder();
  const lines = [];
  let current = '',
    size = 0;
  for (const character of value) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) {
      lines.push(current);
      current = ' ';
      size = 1;
    }
    current += character;
    size += bytes;
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** All-day reminders only; interview times remain in the original source quote. */
export function createCalendar(notice) {
  const events = (notice?.supported ? notice.deadlines || [] : []).filter(
    (deadline) =>
      deadline.confirmed === true && deadline.excluded !== true && validISO(deadline.date),
  );
  const output = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anchor//Source-backed notice reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  const stampDate = new Date(notice?.createdAt || Date.now());
  const stamp = (Number.isNaN(stampDate.getTime()) ? new Date() : stampDate)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  for (const event of events) {
    const [year, month, day] = event.date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');
    output.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(notice.id)}-${encodeURIComponent(event.id)}@anchor.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeCalendar(`CalFresh: ${event.label}`)}`,
      `DESCRIPTION:${escapeCalendar(`User-confirmed date from ${notice.filename}. All-day reminder; check the original notice for any appointment time and current instructions.\nSource: ${event.quote}\nThis reminder does not submit documents or establish agency acceptance.`)}`,
      'END:VEVENT',
    );
  }
  output.push('END:VCALENDAR');
  return `${output.map(foldCalendarLine).join('\r\n')}\r\n`;
}
