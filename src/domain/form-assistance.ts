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
  /** One-based physical page for this mapped field, when a section spans pages. */
  page?: number;
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
  /** An unencrypted working copy, with the official original preserved above. */
  editablePath?: string;
  editableSha256?: string;
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
  /** Earlier freeform drafts remain available for explicit transfer; never guessed into table cells. */
  legacyNotes?: Record<string, string>;
  updatedAt: string;
}
export interface PdfFieldValue {
  name: string;
  type: 'text' | 'checkbox';
  value: string | boolean;
  label?: string;
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
    fillable: true,
    editablePath: './forms/sar7b-editable.pdf',
    editableSha256: '21b62219de687f9d4a48cca39a83d7f6feceb9c9d14f8c666462b9548e140841',
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

const onPage = (page: number, fields: FormField[]): FormField[] =>
  fields.map((field) => ({ ...field, page }));
const when = (id: string, fields: FormField[]): FormField[] =>
  fields.map((field) => ({ ...field, showIf: { field: id, equals: 'yes' } }));
const pick = (id: string, label: string, options: [string, string, string[]][]): FormField => ({
  id,
  label,
  kind: 'choice',
  choices: [...options.map(([value, label]) => ({ value, label })), yesNo[2]],
  pdfChecks: Object.fromEntries(options.map(([value, , names]) => [value, names])),
  help: 'Read the matching question and conditions on the official form.',
});
const pair = (id: string, label: string, yes: string, no: string): FormField =>
  pick(id, label, [
    ['yes', 'Yes', [yes]],
    ['no', 'No', [no]],
  ]);
const compactDate = (id: string, label: string, name: string): FormField => ({
  ...text(
    id,
    label,
    [name],
    'Use six digits: MMDDYY. The official form supplies the date separators.',
  ),
  maxLength: 6,
});
const cfMemberRows = () =>
  [1, 2, 3].flatMap((row) => {
    const start = (row - 1) * 6 + 1;
    const prefix = `Q1 · Person ${row}`;
    return [
      pick(`member${row}Change`, `${prefix} · Moved in or out?`, [
        ['in', 'Moved in', [`question1-1-${start}-1`]],
        ['out', 'Moved out', [`question1-1-${start}-2`]],
      ]),
      compactDate(`member${row}MoveDate`, `${prefix} · Date of move`, `question1-1-${start + 1}`),
      text(`member${row}Name`, `${prefix} · Full name`, [`question1-1-${start + 2}`]),
      compactDate(`member${row}BirthDate`, `${prefix} · Date of birth`, `question1-1-${start + 3}`),
      text(`member${row}Relationship`, `${prefix} · Relationship to you`, [
        `question1-1-${start + 4}`,
      ]),
      question(
        `member${row}FoodTogether`,
        `${prefix} · Buy and prepare food together?`,
        `question1-1-${start + 5}`,
      ),
    ];
  });
const cfStudentRows = () =>
  [1, 2].flatMap((row) => {
    const start = (row - 1) * 4 + 1;
    const prefix = `Q6 · Student ${row}`;
    return [
      text(`student${row}Name`, `${prefix} · Full name`, [`question6-1-${start}`]),
      text(`student${row}School`, `${prefix} · School or training`, [`question6-1-${start + 1}`]),
      pick(`student${row}Enrollment`, `${prefix} · Enrollment`, [
        ['half', 'Half-time or more', [`question6-1-${start + 2}-1`]],
        ['less', 'Less than half-time', [`question6-1-${start + 2}-2`]],
        ['units', 'Specify number of units', [`question6-1-${start + 2}-3`]],
      ]),
      text(`student${row}Units`, `${prefix} · Number of units (if selected)`, [
        `question6-1-${start + 2}-3-1`,
      ]),
      pair(
        `student${row}Working`,
        `${prefix} · Working?`,
        `question6-1-${start + 3}-2`,
        `question6-1-${start + 3}-1`,
      ),
      text(`student${row}Hours`, `${prefix} · Average work hours per week`, [
        `question6-1-${start + 3}-2-1`,
      ]),
    ];
  });
const cfJobRows = () =>
  [1, 2, 3].flatMap((row) => {
    const start = (row - 1) * 7 + 1;
    const prefix = `Q7 · Job ${row}`;
    return [
      text(`job${row}Name`, `${prefix} · Person receiving income`, [`question7-1-${start}`]),
      text(`job${row}Employer`, `${prefix} · Employer`, [`question7-1-${start + 1}`]),
      checkbox(`job${row}SelfEmployed`, `${prefix} · Self-employed`, `question7-1-${start + 2}-1`),
      pick(`job${row}Frequency`, `${prefix} · How often paid`, [
        ['weekly', 'Weekly', [`question7-1-${start + 3}-1`]],
        ['biweekly', 'Biweekly', [`question7-1-${start + 3}-2`]],
        ['monthly', 'Monthly', [`question7-1-${start + 3}-3`]],
        ['twiceMonthly', 'Twice monthly', [`question7-1-${start + 3}-4`]],
        ['other', 'Other', [`question7-1-${start + 3}-5`]],
      ]),
      money(`job${row}Gross`, `${prefix} · Monthly gross income`, [`question7-1-${start + 4}`]),
      text(`job${row}Hours`, `${prefix} · Hours worked per month`, [`question7-1-${start + 5}`]),
      question(
        `job${row}Continues`,
        `${prefix} · Will income continue?`,
        `question7-1-${start + 6}`,
      ),
    ];
  });
const cfOtherIncomeRows = () =>
  [1, 2, 3].flatMap((row) => {
    const start = (row - 1) * 4 + 1;
    return [
      ['Name', 'Person receiving income'],
      ['Source', 'Source of income'],
      ['Pattern', 'One-time or ongoing payment'],
      ['Amount', 'How much / how often'],
    ].map(([id, label], index) =>
      text(`otherIncome${row}${id}`, `Q8 · Income ${row} · ${label}`, [
        `question8-1-${start + index}`,
      ]),
    );
  });

/** Verified against both the canonical AcroForm tree and physical page widgets. */
const cf37Sections: FormSection[] = [
  {
    id: 'identity',
    title: 'Your case & contact details',
    page: 8,
    description: 'Use the case details and contact information requested by your county.',
    fields: onPage(8, [
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
    ]),
  },
  {
    id: 'household',
    title: 'Household & address changes',
    page: 8,
    description:
      'Use the last six months. The form has three household rows; use Additional information for more people.',
    fields: onPage(8, [
      question('q1', 'Q1 · Has anyone moved into or out of your home?', 'question1'),
      ...when('q1', cfMemberRows()),
      question('q2', 'Q2 · Do you want someone to help with your case?', 'question2'),
      ...when('q2', [
        text('representativeName', 'Case helper’s name', ['question2-1-1']),
        text('representativePhone', 'Case helper’s phone', ['question2-1-2']),
      ]),
      question('q2b', 'Q2 · Do you want someone to receive and spend benefits?', 'question2b'),
      ...when(
        'q2b',
        [
          ['Name', 'Name'],
          ['Phone', 'Phone'],
          ['Street', 'Street address'],
          ['City', 'City'],
          ['State', 'State'],
          ['Zip', 'ZIP code'],
        ].map(([id, label], index) =>
          text(`spendingRepresentative${id}`, `Benefits representative · ${label}`, [
            `question2b-1-${index + 1}`,
          ]),
        ),
      ),
      question('q3', 'Q3 · Has your address changed?', 'question3'),
      ...when('q3', [
        text('newAddress', 'New address', ['question3-1-1']),
        text('dateMoved', 'Date moved', ['question3-1-2']),
        text('changedMailing', 'Mailing address, if different', ['question3-1-3']),
      ]),
    ]),
  },
  {
    id: 'housing',
    title: 'Housing & students',
    page: 8,
    description: 'Q4 applies when housing or costs changed. Q5–6 are on PDF page 9.',
    fields: [
      ...onPage(8, [
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
      ]),
      ...onPage(9, [
        question('q5', 'Q5 · Are you homeless?', 'question5'),
        ...when('q5', [question('q5a', 'Q5 · Do you pay shelter costs?', 'question5-1')]),
        question('q6', 'Q6 · Is an applicant attending college or vocational school?', 'question6'),
        ...when('q6', cfStudentRows()),
      ]),
    ],
  },
  {
    id: 'income',
    title: 'Income & expected changes',
    page: 9,
    description: 'List each job and each income source. Attach proof as the form requests.',
    fields: onPage(9, [
      question('q7', 'Q7 · Does your household get income from a job?', 'question7'),
      ...when('q7', cfJobRows()),
      question('q7a', 'Q7a · Do you expect a job or income change?', 'question7a'),
      ...when('q7a', [
        text('jobChange', 'Q7a · Expected change, line 1', ['question7a-1-1']),
        text('jobChangeLine2', 'Q7a · Expected change, line 2', ['question7a-1-2']),
      ]),
      question('q8', 'Q8 · Does your household get income outside a job?', 'question8'),
      ...when('q8', cfOtherIncomeRows()),
      question('q8a', 'Q8a · Do you expect a change to this income?', 'question8a'),
      ...when('q8a', [
        text('otherIncomeChange', 'Q8a · Explain the expected change', ['question8a-1-1']),
      ]),
    ]),
  },
  {
    id: 'expenses',
    title: 'Expenses & health coverage',
    page: 10,
    description: 'Read the conditions beside each expense question on the form.',
    fields: onPage(10, [
      question(
        'q9',
        'Q9 · New or increased medical costs for a member who is 60 or older, or disabled?',
        'question9',
      ),
      ...when('q9', [
        text('medicalName', 'Q9 · Who had the cost?', ['question9-1-1']),
        text('medicalType', 'Q9 · Type of cost', ['question9-1-2']),
        money('medicalAmount', 'Q9 · Amount paid', ['question9-1-3']),
        text('medicalFrequency', 'Q9 · How often?', ['question9-1-4']),
      ]),
      question('q10', 'Q10 · Does a household member pay child support?', 'question10'),
      ...when('q10', [
        text('childSupportChildren', 'Q10 · Children’s names', ['question10-1-1']),
        money('childSupportAmount', 'Q10 · Current amount required', ['question10-1-2']),
        text('childSupportPayer', 'Q10 · Who paid support?', ['question10-1-3']),
      ]),
      question('q11', 'Q11 · Does your household pay dependent or child care costs?', 'question11'),
      ...when('q11', [
        money('careAmount', 'Q11 · Out-of-pocket amount', ['question11-1-1']),
        text('carePayer', 'Q11 · Who paid?', ['question11-1-2']),
        text('careDependents', 'Q11 · Dependents / children', ['question11-1-3']),
      ]),
      question('q12', 'Q12 · Are you interested in applying for Medi-Cal?', 'question12'),
    ]),
  },
  {
    id: 'declarations',
    title: 'Read the remaining questions',
    page: 10,
    description:
      'Use the exact wording of Q13–18 in the PDF. Ask your county if a question is unclear.',
    fields: onPage(
      10,
      [
        ['13', 'Duplicate benefits'],
        ['14', 'Trafficking of benefits'],
        ['15', 'Trading benefits for drugs'],
        ['16', 'Trading benefits for firearms or explosives'],
        ['17', 'Fleeing felon'],
        ['18', 'Probation / parole violation'],
      ].flatMap(([number, label]) => [
        question(`q${number}`, `Q${number} · ${label}`, `question${number}`),
        ...when(`q${number}`, [
          text(`q${number}Who`, `Q${number} · If yes, who?`, [`question${number}-1-1`]),
        ]),
      ]),
    ),
  },
  {
    id: 'review',
    title: 'Review, sign & return',
    page: 11,
    description:
      'All 11 pages remain in your editable PDF. Review every applicable question, gather proof, and sign and date the certification yourself.',
    fields: [
      {
        ...notes(
          'additionalNotes',
          'Additional information / extra table rows',
          'Written on the official Notes page (PDF page 7). Identify the question number for each extra answer.',
        ),
        pdfText: ['notes'],
        page: 7,
      },
      {
        ...text('signatureContact', 'Contact email or phone beside the signature', [
          'signed_contact',
        ]),
        page: 11,
      },
      checkbox('originalReviewed', 'I compared my draft with every page of the official form'),
      checkbox(
        'signatureNeeded',
        'I understand I must read the certification, sign and date the official form',
      ),
    ],
  },
];

const sar = (number: string | number) => `SAR7  ${number}`;
const sarText = (id: string, label: string, number: string | number) =>
  text(id, label, [sar(number)]);
const sarCheck = (id: string, label: string, number: string | number) =>
  checkbox(id, label, sar(number));
const sarPair = (id: string, label: string, yes: string | number, no: string | number) =>
  pair(id, label, sar(yes), sar(no));
const sarProof = (id: string, label: string, attached: number, help: number) =>
  pick(id, label, [
    ['attached', 'I have attached proof', [sar(attached)]],
    ['help', 'I do not have proof / need help getting proof', [sar(help)]],
  ]);
const sarMembers = () =>
  [1, 2].flatMap((row) => {
    const start = row === 1 ? 122 : 136;
    const prefix = `Person ${row}`;
    return [
      sarText(`member${row}Name`, `${prefix} · Full name`, start),
      sarText(`member${row}BirthDate`, `${prefix} · Date of birth (MM/DD/YYYY)`, start + 1),
      sarText(
        `member${row}Relationship`,
        `${prefix} · Relationship to head of household`,
        start + 2,
      ),
      ...[
        ['Moved in', start + 3],
        ['Birth', start + 5],
        ['Moved out', start + 4],
        ['Death', start + 6],
        ['Temporary absence', row === 1 ? 298 : 516],
        ['Other change', start + 7],
      ].map(([label, number], index) =>
        sarCheck(`member${row}Change${index + 1}`, `${prefix} · ${label}`, number),
      ),
      sarText(`member${row}OtherChange`, `${prefix} · Other change type`, start + 8),
      sarText(`member${row}Explain`, `${prefix} · Explain, line 1`, start + 9),
      sarText(`member${row}ExplainLine2`, `${prefix} · Explain, line 2`, start + 10),
      sarText(
        `member${row}ChangeDate`,
        `${prefix} · Date of change (MM/DD/YYYY)`,
        row === 1 ? 135 : 160,
      ),
      sarPair(
        `member${row}FoodTogether`,
        `${prefix} · Buy and make food together?`,
        start + 11,
        start + 12,
      ),
    ];
  });
const sarIncomeRows = () =>
  [1, 2, 3, 4].flatMap((row) => {
    const last = 570 + (row - 1) * 21;
    const prefix = `Income ${row}`;
    return onPage(row === 1 ? 5 : row === 4 ? 7 : 6, [
      sarText(`income${row}Name`, `${prefix} · Household member name`, 2010 + row),
      ...[
        ['Received in report month', 0],
        ['Started', 1],
        ['Stopped', 2],
        ['Changed', 3],
      ].map(([label, offset], index) =>
        sarCheck(`income${row}Event${index + 1}`, `${prefix} · ${label}`, last - Number(offset)),
      ),
      sarText(`income${row}Explain`, `${prefix} · Explain change, line 1`, last - 4),
      sarText(`income${row}ExplainLine2`, `${prefix} · Explain change, line 2`, last - 5),
      sarText(`income${row}ChangeDate`, `${prefix} · Date of change (MM/DD/YYYY)`, last - 6),
      sarPair(`income${row}FromJob`, `${prefix} · From a job?`, last - 7, last - 10),
      sarText(`income${row}Employer`, `${prefix} · Employer, line 1`, last - 8),
      sarText(`income${row}EmployerLine2`, `${prefix} · Employer, line 2`, last - 9),
      sarText(`income${row}Type`, `${prefix} · Type of income outside a job`, last - 11),
      pick(`income${row}Frequency`, `${prefix} · How often paid`, [
        ['weekly', 'Weekly', [sar(last - 12)]],
        ['biweekly', 'Every 2 weeks', [sar(last - 13)]],
        ['monthly', 'Monthly', [sar(last - 14)]],
        ['twiceMonthly', 'Twice a month', [sar(last - 15)]],
        ['other', 'Other', [sar(last - 16)]],
      ]),
      money(`income${row}Gross`, `${prefix} · Total gross income in report month`, [
        sar(last - 17),
      ]),
      sarText(`income${row}Dates`, `${prefix} · Dates received, line 1`, last - 18),
      sarText(`income${row}DatesLine2`, `${prefix} · Dates received, line 2`, last - 19),
      sarText(`income${row}Hours`, `${prefix} · Hours worked per month`, last - 20),
    ]);
  });
const resourceChecks = [
  [299, 300, 301, 302, 303, 304, 305, 306],
  [307, 308, 309, 3010, 3011, 3012, 3013, 3014],
  [3015, 3016, 3017, 3018, 3019, 3020, 3021, 3022],
];
const sarResourceRows = () =>
  [1, 2, 3].flatMap((row) => {
    const start = 13 + (row - 1) * 4;
    return onPage(row === 1 ? 8 : 9, [
      text(`resource${row}Name`, `Resource ${row} · Household member name`, [
        `Text Field ${start}`,
      ]),
      text(`resource${row}Type`, `Resource ${row} · Type of resource`, [`Text Field ${start + 1}`]),
      ...[
        'Bought',
        'Sold',
        'Gave away',
        'Got as a gift',
        'Traded',
        'Won',
        'Opened / closed',
        'Other',
      ].map((label, index) =>
        sarCheck(
          `resource${row}Event${index + 1}`,
          `Resource ${row} · ${label}`,
          resourceChecks[row - 1][index],
        ),
      ),
      text(`resource${row}Other`, `Resource ${row} · Explain other`, [`Text Field ${start + 1}a`]),
      money(`resource${row}Value`, `Resource ${row} · Value`, [`Text Field ${start + 2}`]),
      text(`resource${row}Dates`, `Resource ${row} · Dates received (MM/DD/YYYY)`, [
        `Text Field ${start + 3}`,
      ]),
    ]);
  });
const sar7Sections: FormSection[] = [
  {
    id: 'report',
    title: 'Report period & contact details',
    page: 1,
    description:
      'Use the report and submit months on your county notice. Contact details are on page 3; optional disability assistance is on page 2.',
    fields: [
      ...onPage(1, [
        sarText('reportMonth', 'Report month', 10),
        sarText('submitMonth', 'Submit month', 35),
        sarText('householdName', 'Household name', 11),
        sarText('noticeStreet', 'Street address on report cover', 12),
        sarText('noticeCity', 'City / town on report cover', 13),
        sarText('noticeZip', 'ZIP code on report cover', 16),
        sarText('noticeDate', 'Date on report cover', 17),
        sarText('caseName', 'Case name', 18),
        sarText('caseNumber', 'Case number', 34),
      ]),
      ...onPage(2, [
        sarPair('disabled', 'Optional · Is anyone in your household disabled?', 22, 23),
        ...when('disabled', [
          sarText('disabledName', 'Person with a disability · Full name', 24),
          sarText('disabledExplain', 'Person with a disability · Explain', 25),
        ]),
        sarPair('disabilityHelp', 'Optional · Does anyone need help due to a disability?', 26, 27),
        ...when('disabilityHelp', [
          sarText('disabilityHelpName', 'Person needing assistance · Full name', 28),
          sarText('disabilityHelpExplain', 'Assistance needed · Explain', 29),
        ]),
      ]),
      ...onPage(3, [
        sarText('homeStreet', 'Home street address', 37),
        sarText('homeApartment', 'Home apartment number', 38),
        sarText('homeCityStateZip', 'Home city, state and ZIP code', 40),
        sarCheck('homeless', 'I am homeless', 39),
        sarText('mailingStreet', 'Mailing street address / PO box, if different', 41),
        sarText('mailingApartment', 'Mailing apartment number', 48),
        sarText('mailingCityStateZip', 'Mailing city, state and ZIP code', 42),
        sarCheck('keepMailing', 'Keep my current mailing address', 43),
        pick('homelessMailing', 'If homeless · Where should mail go?', [
          ['address', 'I entered my mailing address above', [sar(44)]],
          ['county', 'Use the county mailing address (contact county to set up)', [sar(45)]],
          ['general', 'General Delivery (contact post office to set up)', [sar(46)]],
        ]),
        sarText('generalDeliveryZip', 'General Delivery post office ZIP code', 47),
        sarText('homePhone', 'Home phone', 49),
        sarText('cellPhone', 'Cell phone', 50),
        sarText('otherPhone', 'Other phone', 51),
        sarPair('textConsent', 'Receive county text messages about benefits?', 52, 53),
        sarCheck('noEmail', 'I do not have an email address', 520),
        sarText('email', 'Email address', 55),
        sarPair('emailConsent', 'Receive county email notices about benefits?', 56, 57),
      ]),
    ],
  },
  {
    id: 'household',
    title: 'Household changes',
    page: 4,
    description:
      'Report changes since you last reported. The form contains two household rows; attach a separate sheet for more people.',
    fields: onPage(4, [
      sarPair(
        'householdChanged',
        'Has anyone moved in or out, or did you move in with someone?',
        '124a',
        '124a 2',
      ),
      ...when('householdChanged', sarMembers()),
    ]),
  },
  {
    id: 'income',
    title: 'Income & proof',
    page: 5,
    description:
      'Use gross amounts for your report month. Four income rows span pages 5–7; attach more pages if needed.',
    fields: [
      ...onPage(5, [
        sarPair(
          'incomeReceived',
          'Any earned / unearned income in the report month or expected change in the next six months?',
          '569a',
          '569a 2',
        ),
        sarPair(
          'unearnedIncreased',
          'CalFresh · Did total household unearned income increase in the report month?',
          '569a 3',
          '569a 4',
        ),
      ]),
      ...sarIncomeRows(),
      ...onPage(7, [
        sarProof('incomeProof', 'Proof for the income changes', 290, 517),
        sarPair('strike', 'Did anyone stop working because of a strike?', 292, 296),
        ...when('strike', [
          sarText('strikeName', 'Person on strike · Full name', 295),
          money('strikeGross', 'Gross income before strike', [sar(294)]),
        ]),
      ]),
    ],
  },
  {
    id: 'resources',
    title: 'Resources & proof',
    page: 8,
    description:
      'Read the conditions on page 8 before completing this section. Ask your county if resource reporting applies to your household.',
    fields: [
      ...onPage(8, [
        sarPair(
          'resourcesChanged',
          'If this section applies · Any changed or new resources?',
          293,
          297,
        ),
      ]),
      ...when('resourcesChanged', sarResourceRows()),
      ...onPage(9, [sarProof('resourceProof', 'Proof for resource changes', 3023, 3024)]),
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    page: 10,
    description:
      'If your address changed, report new housing and utility costs. Read the medical-cost conditions on page 11.',
    fields: [
      ...onPage(10, [
        sarPair('expensesChanged', 'Have your expenses changed?', 3025, 3026),
        sarPair('addressChanged', 'Has your address changed?', 3027, 3028),
        money('rent', 'Monthly rent or mortgage', ['Text Field 25']),
        sarPair(
          'temporaryHousing',
          'Without a permanent address · Do you pay temporary housing costs?',
          3029,
          3030,
        ),
        ...[
          ['Phone (including cell)', 3031],
          ['Electric / gas', 3032],
          ['Property tax', 3033],
          ['Water', 3034],
          ['Home / renter’s insurance', 3035],
          ['Trash', 3036],
          ['HOA fees', 3037],
          ['Mobile home lot rent', 3038],
          ['Other cost', 3039],
        ].map(([label, number], index) =>
          sarCheck(`utility${index + 1}`, `Cost paid · ${label}`, number),
        ),
        money('propertyTax', 'Property tax amount', ['Text Field 26']),
        money('homeInsurance', 'Home / renter’s insurance amount', ['Text Field 27']),
        money('hoaFees', 'HOA fee amount', ['Text Field 28']),
        text('otherHousingCost', 'Other housing cost · Specify and amount', ['Text Field 29']),
        text('carePayer', 'Who paid dependent / child care?', ['Text Field 30']),
        money('careAmount', 'Care paid in report month', ['Text Field 31']),
        text('careDependents', 'Names of dependents / children', ['Text Field 32']),
        text('childSupportPayer', 'Who paid child support to someone outside household?', [
          'Text Field 33',
        ]),
        money('childSupportAmount', 'Child support paid in report month', ['Text Field 34']),
        sarProof('childSupportProof', 'Proof for child support', 3040, 3041),
      ]),
      ...onPage(11, [
        text('medicalName', 'Who paid medical costs?', ['Text Field 35']),
        money('medicalAmount', 'Medical costs paid in report month', ['Text Field 36']),
        sarProof('medicalProof', 'Proof for medical costs', 3042, 3043),
      ]),
    ],
  },
  {
    id: 'remaining',
    title: 'Remaining questions',
    page: 11,
    description:
      'Review pages 11–13. Work-requirement questions are optional; confirm current requirements with your county. Cash-aid questions apply only if you get cash aid.',
    fields: [
      ...onPage(11, [
        sarPair(
          'lottery',
          'Did anyone win money from gambling / lottery in the last six months?',
          3044,
          3045,
        ),
        ...when('lottery', [
          text('lotteryName', 'Winner’s full name', ['Text Field 37']),
          text('lotteryDate', 'Date of winning (MM/DD/YYYY)', ['Text Field 38']),
          money('lotteryAmount', 'Amount won', ['Text Field 39']),
        ]),
        sarProof('lotteryProof', 'Proof for changes above', 3046, 3047),
      ]),
      ...onPage(
        12,
        [
          ['Health issue prevents work', 481, 521],
          ['Caring for child under 6', 482, 522],
          ['Caring for a person with disability', 483, 523],
          ['Pregnant', 484, 524],
          ['School / training at least half-time', 485, 525],
          ['Unemployment benefits received / applied', 486, 526],
          ['Drug / alcohol treatment or problem', 487, 527],
          ['ORR training at least half-time', 488, 528],
          ['Child under 18 lives in household', 489, 529],
        ]
          .flatMap(([label, check, name], index) => [
            sarCheck(`workExemption${index + 1}`, `Optional work question · ${label}`, check),
            sarText(
              `workExemption${index + 1}Name`,
              `Optional work question · ${label} · Person’s name`,
              name,
            ),
          ])
          .concat([
            sarCheck('workHomeless', 'Optional work question · Experiencing homelessness', '489a'),
            sarCheck('workVeteran', 'Optional work question · Veteran', '489b'),
            sarCheck(
              'workFoster',
              'Optional work question · Age 24 or younger, in foster care at 18',
              '489c',
            ),
            sarProof('workProof', 'Proof for optional work questions', 490, 518),
          ]),
      ),
      ...onPage(13, [
        sarPair(
          'cashWarrant',
          'Cash aid only · Outstanding felony warrant / parole or probation violation?',
          492,
          519,
        ),
        ...when('cashWarrant', [
          sarText('cashWarrantName', 'Cash aid only · Person’s name', 494),
          sarCheck('cashOutstandingWarrant', 'Cash aid only · Outstanding warrant', 495),
          sarCheck('cashParoleViolation', 'Cash aid only · Parole / probation violation', 496),
          sarText('cashWarrantDate', 'Cash aid only · Date, if known', 497),
          sarText('cashWarrantState', 'Cash aid only · State', 498),
        ]),
        ...[
          ['No changes', 499],
          ['Family changes', 500],
          ['Immigration changes', 501],
          ['Custody changes', 502],
          ['IHSS changes', 503],
          ['School / college attendance changes', 504],
          ['Other changes', 505],
        ].map(([label, number], index) =>
          sarCheck(`cashLifeEvent${index + 1}`, `Cash aid only · ${label}`, number),
        ),
        sarText('cashOtherChange', 'Cash aid only · Explain other change', 506),
        sarText('cashChangesExplain', 'Cash aid only · Explain changes', 509),
        sarProof('cashProof', 'Cash aid only · Proof for changes', 507, 508),
      ]),
    ],
  },
  {
    id: 'review',
    title: 'Review, sign & return',
    page: 14,
    description:
      'Download all 14 pages as an editable unsigned PDF. Read the certification, sign and date yourself, attach proof and any extra sheets, then return through an accepted county channel. Page 2 also contains optional requests to stop benefits; review it directly if you want to make that request.',
    fields: [
      checkbox('originalReviewed', 'I checked every applicable question on the actual form'),
      checkbox('signatureNeeded', 'I understand I must sign and date the actual form'),
    ],
  },
];

/** Public, reviewed field definitions; never includes a resident's draft. */
export function officialFormFields(id: OfficialForm['id']): FormField[] {
  return (id === 'cf37' ? cf37Sections : sar7Sections).flatMap((section) => section.fields);
}

const legacyLabels: Record<string, string> = {
  householdDetails: 'Household table details',
  spendingRepresentative: 'Benefits representative details',
  studentDetails: 'Student table details',
  jobDetails: 'Job table details',
  otherIncome: 'Other income table details',
  medicalDetails: 'Medical cost details',
  childSupport: 'Child support details',
  careDetails: 'Care cost details',
  declarationDetails: 'Declaration questions',
  contactDetails: 'Contact details',
  incomeDetails: 'Income details',
  incomeProof: 'Income proof notes',
  resourceQuestions: 'Resource questions',
  expenseDetails: 'Expense details',
  remainingQuestions: 'Remaining questions',
  proofPlan: 'Proof plan',
  interviewPlan: 'Interview plan',
  returnPlan: 'Return plan',
};

export function legacyFormNotes(draft: FormDraft): { label: string; value: string }[] {
  return Object.entries(draft.legacyNotes ?? {})
    .filter(([id]) => Object.hasOwn(legacyLabels, id))
    .map(([id, value]) => ({ label: legacyLabels[id], value: plain(value) }))
    .filter((item) => item.value);
}
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
  const legacyNotes: Record<string, string> = {};
  const currentFields = assistance.sections.flatMap((section) => section.fields);
  for (const id of Object.keys(legacyLabels)) {
    const retained = plain(draft.legacyNotes?.[id]).trim();
    if (retained) legacyNotes[id] = retained;
    const field = currentFields.find((item) => item.id === id);
    const previous = Object.hasOwn(updates, id) ? updates[id] : draft.answers[id];
    if (
      !field ||
      (field.kind === 'choice' && !field.choices?.some((choice) => choice.value === previous))
    ) {
      const note = plain(previous).trim();
      if (note) legacyNotes[id] = note;
    }
  }
  for (const field of currentFields) {
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
  return {
    ...createFormDraft(assistance, now),
    answers,
    ...(Object.keys(legacyNotes).length ? { legacyNotes } : {}),
  };
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
        values.push(
          ...field.pdfText.map((name) => ({
            name,
            type: 'text' as const,
            value,
            label: field.label,
          })),
        );
      }
      if (field.pdfChecks && value !== undefined) {
        const selected = field.pdfChecks[String(value)] ?? [];
        for (const name of new Set(Object.values(field.pdfChecks).flat())) {
          values.push({
            name,
            type: 'checkbox',
            value: selected.includes(name),
            label: field.label,
          });
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
  const legacy = legacyFormNotes(clean);
  if (legacy.length) {
    lines.push(
      'Earlier saved preparation notes',
      'These notes have not been placed in table cells. Copy the details into the matching fields or attach an extra sheet with the official form.',
    );
    lines.push(...legacy.map((item) => `${item.label}: ${item.value}`), '');
  }
  lines.push('Next steps');
  lines.push(
    ...assistance.checklist.map((item, index) => `${index + 1}. ${item.title}. ${item.detail}`),
  );
  return lines.join('\n');
}
