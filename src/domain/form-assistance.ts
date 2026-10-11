/**
 * Source-backed form preparation. This module has no network, storage or AI
 * calls. It only prepares a resident's draft; it never signs, submits, changes a
 * notice request's status, or decides whether a county will accept a form.
 */
import type { ContinuityNotice, NoticeRequest } from './continuity.js';

export type Answer = string | boolean;
export type FieldKind = 'text' | 'textarea' | 'money' | 'choice' | 'checkbox';
export interface FormField {
  id: string;
  label: string;
  kind: FieldKind;
  help?: string;
  choices?: { value: string; label: string }[];
  /** Fields without a mapping remain preparation notes in the answer summary. */
  pdfText?: string[];
  pdfChecks?: Record<string, string[]>;
  maxLength?: number;
  showIf?: { field: string; equals: Answer };
}
export interface FormSection {
  id: string;
  title: string;
  description: string;
  /** One-based physical PDF page, including the form's introductory pages. */
  page: number;
  fields: FormField[];
}
export interface OfficialForm {
  id: 'cf37' | 'sar7b';
  title: string;
  revision: string;
  agency: string;
  sourceUrl: string;
  catalogueUrl: string;
  localPath: string;
  pages: number;
  sha256: string;
  reviewedAt: string;
  fillable: boolean;
  instructionsPath?: string;
}
export interface FormAssistance {
  noticeId: string;
  requestId?: string;
  kind: 'official-form' | 'request-guide';
  title: string;
  rationale: string;
  form: OfficialForm | null;
  sections: FormSection[];
  checklist: { title: string; detail: string }[];
  officialPortal: string | null;
}
export interface FormDraft {
  version: 1;
  id: string;
  noticeId: string;
  requestId?: string;
  formId: OfficialForm['id'] | null;
  answers: Record<string, Answer>;
  updatedAt: string;
}
export interface PdfFieldValue {
  name: string;
  type: 'text' | 'checkbox';
  value: string | boolean;
}

export const OFFICIAL_FORMS: readonly OfficialForm[] = [
  {
    id: 'cf37',
    title: 'CF 37 · CalFresh recertification',
    revision: '11/16',
    agency: 'California Department of Social Services',
    sourceUrl: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf37.pdf',
    catalogueUrl: 'https://www.cdss.ca.gov/inforesources/forms-brochures/forms-alphabetic-list/a-d',
    localPath: './forms/cf37.pdf',
    pages: 11,
    sha256: '6ea8f69d928c30b6fa213e3e4a2f00e094b9f516e731b98807e1d9834e67b64c',
    reviewedAt: '2026-10-10',
    fillable: true,
  },
  {
    id: 'sar7b',
    title: 'SAR 7B · Eligibility status report',
    revision: '12/23',
    agency: 'California Department of Social Services',
    sourceUrl:
      'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/Q-T/SAR7B.pdf?ver=2024-08-27-151418-733',
    catalogueUrl: 'https://www.cdss.ca.gov/inforesources/forms-brochures/forms-alphabetic-list/q-t',
    localPath: './forms/sar7b.pdf',
    instructionsPath: './forms/sar7ab.pdf',
    pages: 14,
    sha256: 'd2bfc272399e15a9fbd445c0ea829f3aa6ad16bfbb8ed1265e3fea95cadee342',
    reviewedAt: '2026-10-10',
    fillable: false,
  },
];

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'ask', label: 'I need help with this question' },
];
const notes = (id: string, label: string, help?: string): FormField => ({
  id,
  label,
  kind: 'textarea',
  help,
  maxLength: 2000,
});
const text = (id: string, label: string, pdfText?: string[], help?: string): FormField => ({
  id,
  label,
  kind: 'text',
  pdfText,
  help,
  maxLength: 120,
});
const question = (id: string, label: string, pdfPrefix?: string): FormField => ({
  id,
  label,
  kind: 'choice',
  choices: yesNo,
  help: 'Read the full question in the official form before choosing an answer.',
  ...(pdfPrefix ? { pdfChecks: { yes: [`${pdfPrefix}-1`], no: [`${pdfPrefix}-2`] } } : {}),
});
const money = (id: string, label: string, pdfText?: string[]): FormField => ({
  id,
  label,
  kind: 'money',
  pdfText,
  maxLength: 14,
});
const checkbox = (id: string, label: string, pdfName?: string): FormField => ({
  id,
  label,
  kind: 'checkbox',
  ...(pdfName ? { pdfChecks: { true: [pdfName] } } : {}),
});

/** Mappings were checked against the actual AcroForm names and page locations. */
const cf37Sections: FormSection[] = [
  {
    id: 'identity',
    title: 'Your case & contact details',
    page: 8,
    description: 'Start with the details the county uses to find and contact your household.',
    fields: [
      text('caseName', 'Case name', ['case_name', 'case_name_header']),
      text('caseNumber', 'Case number', ['case_number', 'case_number_header']),
      text('mailingStreet', 'Mailing street address', ['mailing_street']),
      text('mailingCity', 'City', ['mailing_city']),
      text('mailingState', 'State', ['mailing_state']),
      text('mailingZip', 'ZIP code', ['mailing_zip']),
      text('homePhone', 'Home phone', ['contact_phone_home']),
      text('cellPhone', 'Cell phone', ['contact_phone_cell']),
      text('otherPhone', 'Work, alternate or message phone', ['contact_phone_work']),
      text('email', 'Email address', ['contact_email']),
      checkbox('textConsent', 'I choose to allow county text messages', 'contact_phone_text'),
    ],
  },
  {
    id: 'household',
    title: 'Household & address changes',
    page: 8,
    description: 'Check the six-month period used in these questions.',
    fields: [
      question('q1', 'Q1 · Has anyone moved into or out of your home?', 'question1'),
      {
        ...notes(
          'householdDetails',
          'Details to transfer into the Q1 table',
          'Include the change date and each table column. These notes are exported separately.',
        ),
        showIf: { field: 'q1', equals: 'yes' },
      },
      question('q2', 'Q2 · Do you want someone to help with your case?', 'question2'),
      {
        ...text('representativeName', 'Case helper’s name', ['question2-1-1']),
        showIf: { field: 'q2', equals: 'yes' },
      },
      {
        ...text('representativePhone', 'Case helper’s phone', ['question2-1-2']),
        showIf: { field: 'q2', equals: 'yes' },
      },
      question('q2b', 'Q2 · Do you want someone to receive and spend benefits?', 'question2b'),
      {
        ...notes('spendingRepresentative', 'Representative details to transfer into the form'),
        showIf: { field: 'q2b', equals: 'yes' },
      },
      question('q3', 'Q3 · Has your address changed?', 'question3'),
      {
        ...text('newAddress', 'New address', ['question3-1-1']),
        showIf: { field: 'q3', equals: 'yes' },
      },
      {
        ...text('dateMoved', 'Date moved', ['question3-1-2']),
        showIf: { field: 'q3', equals: 'yes' },
      },
      {
        ...text('changedMailing', 'Mailing address, if different', ['question3-1-3']),
        showIf: { field: 'q3', equals: 'yes' },
      },
    ],
  },
  {
    id: 'housing',
    title: 'Housing & students',
    page: 8,
    description: 'Complete Q4 when its condition applies. Q5–6 continue on PDF page 9.',
    fields: [
      money('rent', 'Q4 · Current monthly rent or mortgage', ['question4_rent']),
      money('propertyCosts', 'Q4 · Separately paid property tax and home insurance per month', [
        'question4_separate',
      ]),
      ...['Phone', 'Trash', 'Water', 'Electric / gas', 'Other heating or cooling'].map(
        (label, index) =>
          checkbox(
            `utility${index + 1}`,
            `Q4a · ${label} cost paid separately`,
            `question4a_${index + 1}`,
          ),
      ),
      question('q5', 'Q5 · Are you homeless?', 'question5'),
      {
        ...question('q5a', 'Q5 · Do you pay shelter costs?', 'question5-1'),
        showIf: { field: 'q5', equals: 'yes' },
      },
      question('q6', 'Q6 · Is an applicant attending college or vocational school?', 'question6'),
      {
        ...notes('studentDetails', 'School, enrollment and work details to transfer into Q6'),
        showIf: { field: 'q6', equals: 'yes' },
      },
    ],
  },
  {
    id: 'income',
    title: 'Income & expected changes',
    page: 9,
    description: 'Keep income sources and supporting documents together.',
    fields: [
      question('q7', 'Q7 · Does your household get income from a job?', 'question7'),
      {
        ...notes(
          'jobDetails',
          'Job details to transfer into Q7',
          'Use the person, employer, pay frequency, gross income, hours and continuation columns.',
        ),
        showIf: { field: 'q7', equals: 'yes' },
      },
      question('q7a', 'Q7a · Do you expect a job or income change?', 'question7a'),
      {
        ...text('jobChange', 'Q7a · Explain the expected change', ['question7a-1-1']),
        showIf: { field: 'q7a', equals: 'yes' },
      },
      question('q8', 'Q8 · Does your household get income outside a job?', 'question8'),
      {
        ...notes('otherIncome', 'Other income details to transfer into Q8'),
        showIf: { field: 'q8', equals: 'yes' },
      },
      question('q8a', 'Q8a · Do you expect a change to this income?', 'question8a'),
      {
        ...text('otherIncomeChange', 'Q8a · Explain the expected change', ['question8a-1-1']),
        showIf: { field: 'q8a', equals: 'yes' },
      },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses & health coverage',
    page: 10,
    description: 'Read the conditions beside each expense question.',
    fields: [
      question(
        'q9',
        'Q9 · New or increased medical costs for a qualifying household member?',
        'question9',
      ),
      {
        ...notes('medicalDetails', 'Medical cost details to transfer into Q9'),
        showIf: { field: 'q9', equals: 'yes' },
      },
      question('q10', 'Q10 · Does a household member pay child support?', 'question10'),
      {
        ...notes('childSupport', 'Child support details to transfer into Q10'),
        showIf: { field: 'q10', equals: 'yes' },
      },
      question('q11', 'Q11 · Does your household pay dependent or child care costs?', 'question11'),
      {
        ...notes('careDetails', 'Care cost details to transfer into Q11'),
        showIf: { field: 'q11', equals: 'yes' },
      },
      question('q12', 'Q12 · Are you interested in applying for Medi-Cal?', 'question12'),
    ],
  },
  {
    id: 'declarations',
    title: 'Read the remaining questions',
    page: 10,
    description:
      'Use the exact wording of Q13–18 in the official PDF. Ask the county if a question is unclear.',
    fields: [
      ...[
        ['13', 'Duplicate benefits'],
        ['14', 'Trafficking of benefits'],
        ['15', 'Trading benefits for drugs'],
        ['16', 'Trading benefits for firearms or explosives'],
        ['17', 'Fleeing felon'],
        ['18', 'Probation / parole violation'],
      ].map(([number, label]) =>
        question(`q${number}`, `Q${number} · ${label}`, `question${number}`),
      ),
      notes('declarationDetails', 'Details or questions to review directly with the county'),
    ],
  },
  {
    id: 'review',
    title: 'Review, sign & return',
    page: 11,
    description:
      'The exported PDF is an unsigned draft. Finish the official form before returning it.',
    fields: [
      notes('proofPlan', 'Requested proof and where you will get it'),
      notes('interviewPlan', 'Your interview appointment or questions for the county'),
      notes('returnPlan', 'Where and how you will return the official form'),
      checkbox('originalReviewed', 'I compared my draft with every page of the official form'),
      checkbox(
        'tablesTransferred',
        'I transferred the separate table notes into the official form',
      ),
      checkbox(
        'signatureNeeded',
        'I understand I must read the certification, sign and date the official form',
      ),
    ],
  },
];

const sar7Sections: FormSection[] = [
  {
    id: 'report',
    title: 'Your report period & contact details',
    page: 1,
    description:
      'Use the report and submit months on your county’s version. Contact details are on page 3.',
    fields: [
      text('reportMonth', 'Report month'),
      text('submitMonth', 'Submit month'),
      text('caseName', 'Case name'),
      text('caseNumber', 'Case number'),
      notes('contactDetails', 'Contact details to transfer to page 3'),
    ],
  },
  {
    id: 'household',
    title: 'Household changes',
    page: 4,
    description: 'Record the people and changes that apply to the form’s period.',
    fields: [
      question('householdChanged', 'Has your household changed?'),
      notes('householdDetails', 'Household table details'),
    ],
  },
  {
    id: 'income',
    title: 'Income & proof',
    page: 5,
    description:
      'The income section spans pages 5–7. Use gross amounts and the report month requested.',
    fields: [
      notes('incomeDetails', 'People, income sources, amounts, pay dates and expected changes'),
      notes('incomeProof', 'Proof available, or help you need getting it'),
    ],
  },
  {
    id: 'resources',
    title: 'Resources & expenses',
    page: 8,
    description:
      'Read the applicability instructions. Ask the county if you are unsure which sections apply.',
    fields: [
      notes('resourceQuestions', 'Resources to report or questions for your county'),
      notes('expenseDetails', 'Housing, utilities, care, support or medical expense details'),
    ],
  },
  {
    id: 'remaining',
    title: 'Remaining questions',
    page: 11,
    description: 'Review pages 11–13 with the included instructions and current county guidance.',
    fields: [
      notes('remainingQuestions', 'Answers or questions to transfer into the remaining sections'),
    ],
  },
  {
    id: 'review',
    title: 'Review, sign & return',
    page: 14,
    description:
      'Your preparation notes are not a SAR 7. Complete and sign the official county form.',
    fields: [
      notes('returnPlan', 'Submission channel and required proof'),
      checkbox('originalReviewed', 'I checked all applicable questions on the actual form'),
      checkbox('signatureNeeded', 'I understand I must sign and date the actual form'),
    ],
  },
];

function plain(value: unknown, limit = 2000): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '')
        .slice(0, limit)
    : '';
}

function formCodes(textValue: string): OfficialForm['id'][] {
  return [
    ...(/\bCF\s*[- ]?\s*37\b/i.test(textValue) ? ['cf37' as const] : []),
    ...(/\bSAR\s*[- ]?\s*7(?:B)?\b/i.test(textValue) ? ['sar7b' as const] : []),
  ];
}

const commonChecklist = [
  {
    title: 'Check the request and date',
    detail: 'Compare the original notice, form number and due date before preparing anything.',
  },
  {
    title: 'Complete the actual form',
    detail: 'Transfer any separate notes, answer applicable questions and review each page.',
  },
  {
    title: 'Gather the requested proof',
    detail: 'Use the notice and form to identify the relevant people, dates and documents.',
  },
  {
    title: 'Read, sign and date',
    detail: 'Anchor leaves signatures blank. Use the signature method accepted by your agency.',
  },
  {
    title: 'Return it through an accepted channel',
    detail: 'Confirm the county’s instructions, keep a copy and save its submission confirmation.',
  },
];

/**
 * A code in the selected request wins. Otherwise, a reviewed CalFresh adapter
 * may suggest CF37 for a renewal. Conflicting codes and unsupported programs
 * deliberately return a useful generic guide instead of guessing a form.
 */
export function getFormAssistance(notice: ContinuityNotice, requestId?: string): FormAssistance {
  const request = requestId
    ? notice.requests.find((item) => item.id === requestId)
    : (notice.requests.find((item) => item.kind === 'form') ?? notice.requests[0]);
  const requestCodes = formCodes(`${request?.title ?? ''}\n${request?.quote ?? ''}`);
  const noticeCodes = formCodes(notice.sourceText ?? '');
  const calfresh = /\bCalFresh\b/i.test(`${notice.program ?? ''}\n${notice.sourceText ?? ''}`);
  let formId: OfficialForm['id'] | null = null;
  let rationale =
    'A specific official form has not been verified for this request. Use the actual form supplied by the agency.';
  if (notice.supported && calfresh && request?.kind === 'form') {
    const codes = requestCodes.length ? requestCodes : noticeCodes;
    if (codes.length === 1) {
      formId = codes[0];
      rationale =
        'This form number appears in the request or notice. Compare it with the form your county supplied.';
    } else if (!codes.length && notice.type === 'renewal') {
      formId = 'cf37';
      rationale =
        'CF 37 is the CDSS CalFresh recertification form. This renewal suggests it; confirm your county’s requested form before using it.';
    }
  }
  const form = OFFICIAL_FORMS.find((item) => item.id === formId) ?? null;
  return {
    noticeId: plain(notice.id, 200),
    requestId: request?.id,
    kind: form ? 'official-form' : 'request-guide',
    title: form?.title ?? plain(request?.title ?? 'Prepare your requested item', 160),
    rationale,
    form,
    sections:
      formId === 'cf37'
        ? cf37Sections
        : formId === 'sar7b'
          ? sar7Sections
          : fallbackSections(request),
    checklist:
      formId === 'cf37'
        ? [
            ...commonChecklist,
            {
              title: 'Keep your interview appointment',
              detail:
                'Use the county’s appointment instructions and ask for help obtaining missing proof.',
            },
          ]
        : form
          ? commonChecklist
          : fallbackChecklist(request),
    officialPortal: calfresh ? 'https://benefitscal.com/' : null,
  };
}

function fallbackSections(request?: NoticeRequest): FormSection[] {
  return [
    {
      id: 'request',
      title: 'Understand this request',
      page: 1,
      description: 'Use the original wording to identify what the agency needs.',
      fields: [
        notes('requestedItem', 'What is requested?', request?.quote),
        notes('period', 'Relevant people, dates or reporting period'),
        notes('questions', 'Questions to ask the agency'),
      ],
    },
    {
      id: 'prepare',
      title: 'Prepare the item',
      page: 1,
      description:
        'Attach your actual form or document to read it here. Keep uncertain answers for agency review.',
      fields: [
        notes('answerNotes', 'Answers or information to transfer into the actual form'),
        notes('proofPlan', 'Evidence available and anything still missing'),
      ],
    },
    {
      id: 'return',
      title: 'Review & return',
      page: 1,
      description: 'Use an accepted submission channel and keep its confirmation.',
      fields: [
        notes('returnPlan', 'Submission plan'),
        checkbox('originalReviewed', 'I checked the prepared item against the original request'),
      ],
    },
  ];
}
function fallbackChecklist(request?: NoticeRequest): FormAssistance['checklist'] {
  const income = /income|pay|wage/i.test(`${request?.kind ?? ''} ${request?.title ?? ''}`);
  return [
    {
      title: 'Check the original request',
      detail: 'Confirm the form or evidence requested and check the notice’s due date.',
    },
    {
      title: income ? 'Match the income period' : 'Gather the right information',
      detail: income
        ? 'Match the people, pay periods and dates requested. Ask which proof is accepted if yours is unavailable.'
        : 'Use the actual agency form and its instructions. Ask for accessible or translated assistance if needed.',
    },
    {
      title: 'Check readability and completeness',
      detail:
        'Include all requested pages and review any required signatures. Do not add unrelated personal information.',
    },
    {
      title: 'Return it and keep proof',
      detail: 'Confirm where to submit, keep a copy and save the agency’s confirmation.',
    },
  ];
}

export function createFormDraft(
  assistance: FormAssistance,
  now = new Date().toISOString(),
): FormDraft {
  return {
    version: 1,
    id: `${assistance.noticeId}:${assistance.requestId ?? 'general'}:${assistance.form?.id ?? 'guide'}`,
    noticeId: assistance.noticeId,
    requestId: assistance.requestId,
    formId: assistance.form?.id ?? null,
    answers: {},
    updatedAt: now,
  };
}

/** Invalid choices, unknown keys and hidden conditional values never reach PDF export. */
export function updateFormDraft(
  assistance: FormAssistance,
  draft: FormDraft,
  updates: Record<string, unknown>,
  now = new Date().toISOString(),
): FormDraft {
  // A stale modal or account switch must not copy another case's draft answers.
  if (
    draft.noticeId !== assistance.noticeId ||
    draft.requestId !== assistance.requestId ||
    draft.formId !== (assistance.form?.id ?? null)
  )
    return createFormDraft(assistance, now);
  const answers: Record<string, Answer> = {};
  for (const field of assistance.sections.flatMap((section) => section.fields)) {
    const value = Object.hasOwn(updates, field.id) ? updates[field.id] : draft.answers[field.id];
    if (field.kind === 'checkbox') {
      if (typeof value === 'boolean') answers[field.id] = value;
    } else if (field.kind === 'choice') {
      if (field.choices?.some((choice) => choice.value === value))
        answers[field.id] = value as string;
    } else {
      const cleaned = plain(value, field.maxLength ?? 2000).trim();
      if (field.kind === 'money') {
        if (/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(cleaned)) answers[field.id] = cleaned;
      } else if (cleaned) answers[field.id] = cleaned;
    }
  }
  return { ...createFormDraft(assistance, now), answers };
}

export function visibleFormFields(section: FormSection, draft: FormDraft): FormField[] {
  return section.fields.filter(
    (field) => !field.showIf || draft.answers[field.showIf.field] === field.showIf.equals,
  );
}

export function assessFormDraft(
  assistance: FormAssistance,
  draft: FormDraft,
): {
  answered: number;
  questions: number;
  needsHelp: number;
  signed: false;
  submitted: false;
  status: 'draft';
} {
  const fields = assistance.sections
    .flatMap((section) => visibleFormFields(section, draft))
    .filter((field) => field.kind !== 'checkbox');
  return {
    answered: fields.filter(
      (field) =>
        typeof draft.answers[field.id] === 'string' &&
        draft.answers[field.id] !== 'ask' &&
        draft.answers[field.id] !== '',
    ).length,
    questions: fields.length,
    needsHelp: fields.filter((field) => draft.answers[field.id] === 'ask').length,
    signed: false,
    submitted: false,
    status: 'draft',
  };
}

/** Only an exact catalogue mapping is usable. No signature or guessed table field is emitted. */
export function toPdfFieldValues(assistance: FormAssistance, draft: FormDraft): PdfFieldValue[] {
  if (!assistance.form?.fillable || draft.formId !== assistance.form.id) return [];
  const clean = updateFormDraft(assistance, draft, {});
  const values: PdfFieldValue[] = [];
  for (const section of assistance.sections) {
    for (const field of visibleFormFields(section, clean)) {
      const value = clean.answers[field.id];
      if (field.pdfText && typeof value === 'string' && value !== 'ask') {
        values.push(...field.pdfText.map((name) => ({ name, type: 'text' as const, value })));
      }
      if (field.pdfChecks && value !== undefined) {
        const selected = field.pdfChecks[String(value)] ?? [];
        for (const name of new Set(Object.values(field.pdfChecks).flat())) {
          values.push({ name, type: 'checkbox', value: selected.includes(name) });
        }
      }
    }
  }
  return values;
}

export function formDraftSummary(assistance: FormAssistance, draft: FormDraft): string {
  const clean = updateFormDraft(assistance, draft, {});
  const lines = [
    `Anchor preparation notes — ${assistance.title}`,
    'DRAFT / UNSIGNED / NOT SUBMITTED',
    'These notes do not replace an official form. Review and transfer them where appropriate.',
    ...(assistance.form ? [`Official source: ${assistance.form.sourceUrl}`] : []),
    '',
  ];
  for (const section of assistance.sections) {
    lines.push(section.title);
    for (const field of visibleFormFields(section, clean)) {
      const value = clean.answers[field.id];
      const label = field.choices?.find((choice) => choice.value === value)?.label;
      if (value !== undefined)
        lines.push(
          `${field.label}: ${label ?? (value === true ? 'Checked' : value === false ? 'Not checked' : value)}`,
        );
    }
    lines.push('');
  }
  lines.push('Next steps');
  lines.push(
    ...assistance.checklist.map((item, index) => `${index + 1}. ${item.title}. ${item.detail}`),
  );
  return lines.join('\n');
}
