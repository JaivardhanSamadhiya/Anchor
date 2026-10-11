/**
 * Shared browser/server policy for Anchor's public-program assistant.
 * The browser interprets questions locally; the cloud boundary accepts only
 * enums. No arbitrary question, notice, draft answer, file, or account profile
 * can become Gemini input, even if a caller bypasses the UI.
 */
export const SOURCE_VERSION = '2026-10-10';
export const PROGRAM_IDS = [
  'calfresh',
  'medi-cal',
  'medicare',
  'ssi',
  'ssdi',
  'housing',
  'wic',
  'energy',
  'unemployment',
  'navigation',
] as const;
export const QUESTION_IDS = [
  'overview',
  'apply',
  'renew',
  'documents',
  'status',
  'appeal',
  'eligibility',
  'reporting',
  'compare',
  'navigate',
] as const;
export const FOCUS_IDS = [
  'general',
  'identity',
  'income',
  'household',
  'proof-alternatives',
  'interview',
  'timing',
  'disability',
  'coverage',
  'waitlist',
  'energy-crisis',
  'ssi-vs-ssdi',
  'medicare-vs-medicaid',
  'snap-vs-wic',
] as const;
export const NAVIGATION_PAGES = [
  'overview',
  'notices',
  'plan',
  'calendar',
  'support',
  'forms',
] as const;
export type ProgramId = (typeof PROGRAM_IDS)[number];
export type QuestionId = (typeof QUESTION_IDS)[number];
export type FocusId = (typeof FOCUS_IDS)[number];
export type NavigationPage = (typeof NAVIGATION_PAGES)[number];
export type AssistantLanguage = 'en' | 'es';
export interface AssistantRequest {
  program: ProgramId;
  questionId: QuestionId;
  focus: FocusId;
  language: AssistantLanguage;
  adultConfirmed: true;
  destination?: NavigationPage;
}
export interface Citation {
  id: string;
  title: string;
  url: string;
}
export interface AssistantResponse {
  mode: 'gemini' | 'source-guidance';
  answer: string;
  citations: Citation[];
  navigation: { page: NavigationPage; label: string } | null;
  sourceVersion: string;
  message?: string;
}
interface ProgramKnowledge {
  label: string;
  summary: string;
  summaryEs: string;
  sources: Citation[];
  facts: string[];
}
const source = (id: string, title: string, url: string): Citation => ({ id, title, url });

// Curated summaries, checked on SOURCE_VERSION, deliberately omit changing
// dollar limits, award amounts, and individual filing/appeal deadlines.
// Source identifiers are resolved to URLs by code, never by model output.
export const PROGRAM_KNOWLEDGE: Record<ProgramId, ProgramKnowledge> = {
  calfresh: {
    label: 'CalFresh / SNAP',
    summary:
      'CalFresh is California’s SNAP food benefit. County offices manage cases. Application, interview, verification, and renewal requirements depend on the household and notice. Contact the county for an individual case decision.',
    summaryEs:
      'CalFresh es el programa SNAP de California. El condado administra los casos. La solicitud, entrevista, comprobantes y renovación dependen del hogar y del aviso. El condado decide cada caso.',
    sources: [
      source('snap', 'USAGov: SNAP applications', 'https://www.usa.gov/food-stamps'),
      source('calfresh', 'CDSS: CalFresh', 'https://www.cdss.ca.gov/inforesources/calfresh'),
      source(
        'cf37',
        'CDSS: CalFresh recertification form CF 37',
        'https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf37.pdf',
      ),
      source(
        'calfresh-contact',
        'CDSS: County and case contacts',
        'https://www.cdss.ca.gov/inforesources/calfresh/contacts',
      ),
    ],
    facts: [
      '[snap] SNAP provides food benefits through an EBT card. State or local SNAP offices handle applications; an interview may be required.',
      '[calfresh] CalFresh is state-supervised and county-operated. Household size, countable income, and expenses affect benefits.',
      '[cf37] CF 37 is the recertification form. Its instructions discuss signing and returning the application, an interview, providing requested proof, and a state hearing. The notice and county determine the applicable dates and requirements.',
      '[calfresh-contact] Contact the county office for case questions, missing proof, interview arrangements, or accepted alternatives; Anchor cannot decide which substitute proof will be accepted.',
    ],
  },
  'medi-cal': {
    label: 'Medi-Cal / Medicaid',
    summary:
      'Medi-Cal is California’s Medicaid program. The state and county administer coverage. Renewal requests and needed proof depend on the case. Contact the county about your notice, coverage, renewal, or missing information.',
    summaryEs:
      'Medi-Cal es Medicaid en California. El estado y el condado administran la cobertura. La renovación y los comprobantes dependen del caso. Consulte al condado sobre su aviso, cobertura o información pendiente.',
    sources: [
      source(
        'medicaid',
        'USAGov: Medicaid and CHIP',
        'https://www.usa.gov/medicaid-chip-insurance',
      ),
      source('medi-cal', 'DHCS: Medi-Cal', 'https://www.dhcs.ca.gov/medi-cal/'),
      source(
        'medi-cal-contact',
        'DHCS: Medi-Cal contacts and renewals',
        'https://www.dhcs.ca.gov/contact-us/',
      ),
    ],
    facts: [
      '[medicaid] Medicaid is state-administered health coverage. States have their own eligibility requirements. Applications can be made through the state agency or Health Insurance Marketplace.',
      '[medicaid] The state may review information each year; if more information is needed, the agency contacts the resident about renewal. Required application documents vary by state.',
      '[medi-cal] Medi-Cal is California’s Medicaid program. Use DHCS and the county for current program instructions.',
      '[medi-cal-contact] DHCS directs individual coverage, eligibility, status, and information-update questions to the local county office. Renewal resources and an Ombudsman contact are available. Do not provide clinical advice.',
    ],
  },
  medicare: {
    label: 'Medicare',
    summary:
      'Medicare is federal health insurance for eligible older adults and some people with qualifying disabilities or conditions. Some people are enrolled automatically; others must sign up. Use Medicare’s official enrollment guide for timing and coverage choices.',
    summaryEs:
      'Medicare es un seguro médico federal para adultos mayores elegibles y algunas personas con discapacidades o condiciones específicas. Algunas inscripciones son automáticas; otras requieren solicitud. Consulte la guía oficial para fechas y opciones.',
    sources: [
      source(
        'medicare',
        'Medicare: Getting started',
        'https://www.medicare.gov/basics/get-started-with-medicare',
      ),
    ],
    facts: [
      '[medicare] Medicare covers people age sixty-five or older who meet citizenship or residency requirements; some people qualify earlier with disability, ESRD, or ALS.',
      '[medicare] Automatic enrollment or active signup depends on Social Security retirement/disability circumstances. Medicare’s guide links to enrollment periods, coverage options, costs, and human help. Do not invent an enrollment date or recommend a particular insurance plan.',
    ],
  },
  ssi: {
    label: 'Supplemental Security Income (SSI)',
    summary:
      'SSI provides monthly payments to eligible people with limited income and resources who meet age, blindness, or disability requirements. Social Security decides eligibility. SSI and SSDI have different rules.',
    summaryEs:
      'SSI ofrece pagos mensuales a personas elegibles con ingresos y recursos limitados que cumplen requisitos de edad, ceguera o discapacidad. Seguro Social decide la elegibilidad. SSI y SSDI tienen reglas diferentes.',
    sources: [source('ssi', 'Social Security: SSI', 'https://www.ssa.gov/ssi')],
    facts: [
      '[ssi] SSI can help adults and children with little or no income and resources who have a qualifying disability or blindness; older adults may qualify on age grounds.',
      '[ssi] Payment depends on income, living situation, resources, and other factors. Residents must report wages, other income, resource changes, and living-arrangement changes. SSA’s page links to applications, reporting, and other assistance. Do not diagnose disability or calculate benefits.',
    ],
  },
  ssdi: {
    label: 'Social Security Disability Insurance (SSDI)',
    summary:
      'SSDI provides payments to eligible people whose disability limits or prevents work and who have sufficient work history. Social Security makes the determination. Report requested changes and respond to any review through SSA.',
    summaryEs:
      'SSDI ofrece pagos a personas elegibles cuya discapacidad limita o impide trabajar y que tienen suficiente historial laboral. Seguro Social decide. Informe los cambios requeridos y responda a las revisiones mediante SSA.',
    sources: [source('ssdi', 'Social Security: Disability', 'https://www.ssa.gov/disability')],
    facts: [
      '[ssdi] Disability benefits require a qualifying disability or blindness and enough work history. Benefit amounts depend on prior work history.',
      '[ssdi] Approved residents must report changes in work, income, and personal information. Continuing disability reviews may require a report. Official SSA links explain applying, reporting, work incentives, and reviews. Do not promise that working will preserve or end benefits.',
    ],
  },
  housing: {
    label: 'Housing Choice Vouchers / HUD',
    summary:
      'HUD’s Housing Choice Voucher program helps eligible households afford rental housing. Local public housing agencies manage applications and waiting lists. Contact the local agency for eligibility, status, required proof, and open waiting lists.',
    summaryEs:
      'El programa de vales de HUD ayuda a hogares elegibles a pagar alquiler. Las agencias locales de vivienda administran solicitudes y listas de espera. Consulte a la agencia local sobre requisitos, estado y listas abiertas.',
    sources: [
      source(
        'housing',
        'USAGov: Section 8 housing',
        'https://www.usa.gov/housing-voucher-section-8',
      ),
    ],
    facts: [
      '[housing] HUD runs the Housing Choice Voucher program, also known as Section Eight. Local public housing agencies manage it.',
      '[housing] Eligibility depends on gross income, family size, and eligible citizenship or immigration status. Contact the PHA to apply or check status.',
      '[housing] Waiting lists and long waits are common; a PHA can close its list. Check its official website for reopening. A voucher is not guaranteed by application or an Anchor checklist.',
    ],
  },
  wic: {
    label: 'WIC',
    summary:
      'WIC offers food, nutrition counseling, and referrals for eligible pregnant/postpartum or breastfeeding people and young children. Your state or local WIC agency explains application appointments and what to bring.',
    summaryEs:
      'WIC ofrece alimentos, orientación nutricional y referencias a personas embarazadas, en posparto o lactancia y niños pequeños elegibles. La agencia WIC local explica la solicitud, las citas y qué llevar.',
    sources: [source('wic', 'USAGov: WIC food assistance', 'https://www.usa.gov/food-assistance')],
    facts: [
      '[wic] WIC provides food, nutrition counseling, and social-service referrals. Eligibility covers specified pregnancy, postpartum, breastfeeding, and young-child categories, with income, health, and residency requirements.',
      '[wic] The state or local WIC agency tells applicants where and how to apply and what to bring to an appointment. Direct personal eligibility and nutrition/medical questions to the agency; do not provide clinical advice.',
    ],
  },
  energy: {
    label: 'LIHEAP / energy assistance',
    summary:
      'LIHEAP may help with heating or cooling bills and energy crises. Rules and application methods vary by state or territory. Contact the local LIHEAP office and utility provider for urgent disconnection questions.',
    summaryEs:
      'LIHEAP puede ayudar con facturas de calefacción, refrigeración y crisis energéticas. Las reglas y solicitudes varían por estado o territorio. Para cortes urgentes, contacte la oficina LIHEAP y su proveedor.',
    sources: [
      source('energy', 'USAGov: Energy bill help', 'https://www.usa.gov/help-with-energy-bills'),
    ],
    facts: [
      '[energy] LIHEAP can help with heating/cooling costs or emergency energy-crisis services. Requirements and whether an application is online or in person vary by location.',
      '[energy] Weatherization assistance is a separate program. Utility-disconnection protections vary by state, weather, age, disability, and utility. Do not promise restoration, protection from shutoff, funding availability, or an emergency response time.',
    ],
  },
  unemployment: {
    label: 'Unemployment insurance',
    summary:
      'States manage unemployment insurance and set eligibility and filing rules. In most cases, applications are filed in the state where the person worked. The state unemployment office handles claims, proof, ongoing requirements, and decisions.',
    summaryEs:
      'Los estados administran el seguro de desempleo y sus requisitos. Normalmente se solicita en el estado donde se trabajó. La oficina estatal administra solicitudes, comprobantes, requisitos continuos y decisiones.',
    sources: [
      source(
        'unemployment',
        'USAGov: Unemployment benefits',
        'https://www.usa.gov/unemployment-benefits',
      ),
    ],
    facts: [
      '[unemployment] Each state manages its own unemployment insurance program. State rules may consider past earnings, work history, reasons for job loss, and job search.',
      '[unemployment] Most applicants file in the state where they worked. People who worked in multiple states or remotely should ask the state office how to file. Use the official state link for current applications and rules. Never invent a weekly certification requirement, deadline, or payout.',
    ],
  },
  navigation: {
    label: 'Using Anchor',
    summary:
      'Anchor helps read a notice, check its dates, prepare requested evidence, save a submission record, and follow up with the agency. My notices opens documents; Action plan organizes steps; Calendar holds checked dates; Get support opens official resources.',
    summaryEs:
      'Anchor ayuda a leer avisos, revisar fechas, preparar comprobantes, guardar un registro de envío y dar seguimiento. Mis avisos abre documentos; Plan organiza pasos; Calendario muestra fechas revisadas; Ayuda abre recursos oficiales.',
    sources: [],
    facts: [
      'Anchor Overview summarizes progress; Notices imports and reviews documents; Plan organizes preparation and follow-up; Calendar exports or creates reminders for checked dates; Support shows official agency links; Forms opens guided local form preparation. Anchor does not submit benefit applications to agencies or decide eligibility.',
      'Navigation suggestions are buttons. The user chooses whether to navigate. An AI response cannot execute a command, submit a form, alter evidence, add a calendar event, or access the account.',
    ],
  },
};

export const QUESTION_LABELS: Record<QuestionId, string> = {
  overview: 'How does this program work?',
  apply: 'How can someone apply?',
  renew: 'How does renewal or review work?',
  documents: 'What should someone know about requested proof?',
  status: 'How can someone check a case or application?',
  appeal: 'Where can someone get help with a decision or appeal?',
  eligibility: 'What are the general eligibility considerations?',
  reporting: 'How can someone report required changes?',
  compare: 'What is the difference between these programs?',
  navigate: 'Help me find this part of Anchor.',
};
export const FOCUS_LABELS: Record<FocusId, string> = {
  general: 'General program guidance',
  identity: 'Identity-related proof',
  income: 'Income-related rules and proof',
  household: 'Household and living-arrangement questions',
  'proof-alternatives': 'Missing documents or alternative proof',
  interview: 'Interviews and appointments',
  timing: 'Timing and notice deadlines',
  disability: 'Disability-related requirements',
  coverage: 'Health coverage questions',
  waitlist: 'Waiting lists',
  'energy-crisis': 'Urgent energy assistance',
  'ssi-vs-ssdi': 'SSI compared with SSDI',
  'medicare-vs-medicaid': 'Medicare compared with Medicaid',
  'snap-vs-wic': 'SNAP compared with WIC',
};
const COMPARISONS: Partial<Record<FocusId, readonly ProgramId[]>> = {
  'ssi-vs-ssdi': ['ssi', 'ssdi'],
  'medicare-vs-medicaid': ['medicare', 'medi-cal'],
  'snap-vs-wic': ['calfresh', 'wic'],
};

function knowledgeForRequest(request: AssistantRequest): ProgramKnowledge {
  const pair = request.questionId === 'compare' ? COMPARISONS[request.focus] : undefined;
  if (!pair) return PROGRAM_KNOWLEDGE[request.program];
  const entries = pair.map((id) => PROGRAM_KNOWLEDGE[id]);
  return {
    label: entries.map((entry) => entry.label).join(' and '),
    summary: entries.map((entry) => entry.summary).join('\n\n'),
    summaryEs: entries.map((entry) => entry.summaryEs).join('\n\n'),
    sources: entries.flatMap((entry) => entry.sources),
    facts: entries.flatMap((entry) => entry.facts),
  };
}
export const sourcesForRequest = (request: AssistantRequest): Citation[] =>
  knowledgeForRequest(request).sources.map((item) => ({ ...item }));
const PAGE_LABELS: Record<NavigationPage, string> = {
  overview: 'Overview',
  notices: 'My notices',
  plan: 'Action plan',
  calendar: 'Calendar',
  support: 'Get support',
  forms: 'Form workspace',
};
const PAGE_LABELS_ES: Record<NavigationPage, string> = {
  overview: 'Resumen',
  notices: 'Mis avisos',
  plan: 'Plan de acción',
  calendar: 'Calendario',
  support: 'Obtener ayuda',
  forms: 'Espacio de formularios',
};
const validMember = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);

export function parseAssistantRequest(value: unknown): AssistantRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed = ['program', 'questionId', 'focus', 'language', 'adultConfirmed', 'destination'];
  if (Object.keys(data).some((key) => !allowed.includes(key))) return null;
  if (
    !validMember(data.program, PROGRAM_IDS) ||
    !validMember(data.questionId, QUESTION_IDS) ||
    !validMember(data.focus, FOCUS_IDS) ||
    !['en', 'es'].includes(String(data.language)) ||
    data.adultConfirmed !== true
  )
    return null;
  if (data.destination !== undefined && !validMember(data.destination, NAVIGATION_PAGES))
    return null;
  if ((data.program === 'navigation') !== (data.questionId === 'navigate')) return null;
  if (data.program === 'navigation' && (!data.destination || data.focus !== 'general')) return null;
  if (data.program !== 'navigation' && data.destination !== undefined) return null;
  const pair = COMPARISONS[data.focus];
  if (data.questionId === 'compare' ? !pair?.includes(data.program) : pair !== undefined)
    return null;
  return {
    program: data.program,
    questionId: data.questionId,
    focus: data.focus,
    language: data.language as AssistantLanguage,
    adultConfirmed: true,
    ...(data.destination ? { destination: data.destination as NavigationPage } : {}),
  };
}

export interface LocalQuestion {
  request: Omit<AssistantRequest, 'adultConfirmed'> | null;
  message: string;
  preview: string;
}

/** Interpret natural wording locally, and show the reconstructed public topic. */
export function classifyPublicQuestion(
  question: string,
  selectedProgram: ProgramId = 'calfresh',
  language: AssistantLanguage = 'en',
): LocalQuestion {
  const value =
    typeof question === 'string'
      ? question
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      : '';
  const reject = (message: string): LocalQuestion => ({ request: null, message, preview: '' });
  if (!value || value.length > 600)
    return reject(
      language === 'es'
        ? 'Escriba una pregunta breve sobre un programa o Anchor.'
        : 'Ask a short question about a program or using Anchor.',
    );
  if (
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b\d{6,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?1[- .]?)?\(?\d{3}\)?[- .]?\d{3}[- .]?\d{4}|\b(?:my name is|my address|my case number|case id|social security number|mi nombre es|mi direccion|numero de caso)\b/.test(
      value,
    )
  )
    return reject(
      language === 'es'
        ? 'Mantenga los datos personales en su espacio privado. Pregunte aquí por el proceso general.'
        : 'Keep personal details in your private workspace. Ask here about the general process.',
    );
  if (
    /\b(?:ignore (?:all |previous )?instructions|system prompt|api key|password|jailbreak|ignore las instrucciones|clave secreta)\b/.test(
      value,
    )
  )
    return reject(
      language === 'es'
        ? 'Puedo orientar sobre programas cubiertos y navegación en Anchor.'
        : 'I can help with covered programs and navigation in Anchor.',
    );
  const pageTests: [NavigationPage, RegExp][] = [
    ['calendar', /calendar|calendario|google calendar/],
    [
      'forms',
      /(?:open|find|where|show|abrir|donde).*(?:form|formulario)|(?:fill|llenar).*(?:form|formulario)/,
    ],
    [
      'notices',
      /(?:upload|import|open|add|where|subir|cargar|abrir).*(?:notice|pdf|document|aviso)/,
    ],
    [
      'plan',
      /(?:open|find|where|show|abrir|donde).*(?:plan|checklist|next step|lista|siguiente paso)/,
    ],
    ['support', /(?:where|find|open|show|donde|abrir).*(?:support|help|resources|ayuda|recursos)/],
    ['overview', /(?:open|show|home|abrir|inicio).*(?:overview|dashboard|resumen)|\bhome page\b/],
  ];
  const navigation = pageTests.find(([, pattern]) => pattern.test(value));
  if (
    navigation &&
    !/snap|calfresh|medi-cal|medicaid|medicare|\bssi\b|\bssdi\b|wic|liheap|unemployment|section 8|hud/.test(
      value,
    )
  ) {
    const request = {
      program: 'navigation' as const,
      questionId: 'navigate' as const,
      focus: 'general' as const,
      language,
      destination: navigation[0],
    };
    return {
      request,
      message: '',
      preview: `${PROGRAM_KNOWLEDGE.navigation.label}: ${PAGE_LABELS[navigation[0]]}`,
    };
  }
  const programs: [ProgramId, RegExp][] = [
    ['calfresh', /calfresh|snap|food stamps|estampillas/],
    ['medi-cal', /medi-?cal\b|medicaid|chip\b/],
    ['medicare', /medicare/],
    ['ssdi', /\bssdi\b|disability insurance/],
    ['ssi', /\bssi\b|supplemental security/],
    ['housing', /housing|section (?:8|eight)|voucher|\bhud\b|vivienda|alquiler/],
    ['wic', /\bwic\b/],
    ['energy', /liheap|energy|utility|electric|heating|cooling|energia|luz/],
    ['unemployment', /unemployment|job loss|laid off|desempleo/],
  ];
  const detectedProgram = programs.find(([, pattern]) => pattern.test(value))?.[0];
  const program =
    detectedProgram ||
    (validMember(selectedProgram, PROGRAM_IDS) && selectedProgram !== 'navigation'
      ? selectedProgram
      : 'calfresh');
  const intents: [QuestionId, RegExp][] = [
    ['appeal', /appeal|deni(?:ed|al)|hearing|disagree|decision|apel|audiencia|negad/],
    [
      'documents',
      /document|proof|verification|pay ?stub|missing|alternative|comprobante|verificacion|falta/,
    ],
    ['renew', /renew|recertif|review|renovar|renovacion|revision/],
    ['reporting', /report|change|moved|update|informar|cambio|actualizar/],
    ['eligibility', /eligib|qualif|income limit|work histor|requisit|calific/],
    ['status', /status|balance|waiting|waitlist|estado|saldo|lista de espera/],
    ['apply', /apply|application|enroll|sign ?up|solicitud|solicitar|inscrib/],
  ];
  const intent = intents.find(([, pattern]) => pattern.test(value));
  if (
    !detectedProgram &&
    !intent &&
    !/benefit|program|how|what|interview|income|household|coverage|when|beneficio|programa|como|que|entrevista|ingreso|hogar|cuando/.test(
      value,
    )
  )
    return reject(
      language === 'es'
        ? 'Seleccione un programa cubierto o pregunte cómo usar Anchor.'
        : 'Choose a covered program or ask how to use Anchor.',
    );
  const focuses: [FocusId, RegExp][] = [
    [
      'proof-alternatives',
      /alternative|missing|lost|cannot (?:find|get)|no (?:tengo|encuentro)|alternativ|perdi/,
    ],
    ['interview', /interview|appointment|entrevista|cita/],
    ['timing', /deadline|when|late|timing|due|cuand|plazo|tarde/],
    ['waitlist', /wait(?:ing|list)|lista de espera/],
    ['energy-crisis', /shut.?off|disconnect|crisis|corte|desconect/],
    ['identity', /identity|identification|identidad|identificacion/],
    ['income', /income|earning|pay ?stub|wage|ingreso|salario/],
    ['household', /household|family|living arrangement|hogar|familia/],
    ['disability', /disabil|blind|discapaci|ceguera/],
    ['coverage', /coverage|insurance|cobertura|seguro/],
  ];
  const focus = focuses.find(([, pattern]) => pattern.test(value))?.[0] || 'general';
  const comparison: FocusId | undefined =
    /\bssi\b/.test(value) && /\bssdi\b/.test(value)
      ? 'ssi-vs-ssdi'
      : /medicare/.test(value) && /medicaid|medi-?cal\b/.test(value)
        ? 'medicare-vs-medicaid'
        : /snap|calfresh/.test(value) && /\bwic\b/.test(value)
          ? 'snap-vs-wic'
          : undefined;
  const request = {
    program,
    questionId: comparison
      ? 'compare'
      : intent?.[0] || (focus === 'interview' || focus === 'timing' ? 'renew' : 'overview'),
    focus: comparison || focus,
    language,
  } as Omit<AssistantRequest, 'adultConfirmed'>;
  return {
    request,
    message: '',
    preview: `${PROGRAM_KNOWLEDGE[program].label} · ${QUESTION_LABELS[request.questionId]} · ${FOCUS_LABELS[request.focus]}`,
  };
}

const publicCaveat = (language: AssistantLanguage) =>
  language === 'es'
    ? 'Revise las instrucciones y fechas de su aviso con la agencia. Anchor no decide elegibilidad ni envía solicitudes.'
    : 'Check the instructions and dates in your notice with the agency. Anchor does not decide eligibility or submit applications.';
const navigationFor = (request: AssistantRequest) => {
  const page =
    request.destination ||
    (request.questionId === 'status' ||
    request.questionId === 'appeal' ||
    request.questionId === 'eligibility' ||
    request.questionId === 'apply'
      ? 'support'
      : request.questionId === 'documents' || request.questionId === 'renew'
        ? 'plan'
        : 'notices');
  return { page, label: request.language === 'es' ? PAGE_LABELS_ES[page] : PAGE_LABELS[page] };
};

export function sourceGuidance(request: AssistantRequest, message?: string): AssistantResponse {
  const knowledge = knowledgeForRequest(request);
  const focusAdvice =
    request.language === 'es'
      ? {
          'proof-alternatives':
            'Si falta un comprobante, pregunte a la agencia qué alternativa acepta antes de la fecha del aviso.',
          interview:
            'Confirme con la agencia cómo asistir o reprogramar una entrevista; guarde el registro de su contacto.',
          timing:
            'Use la fecha exacta de su aviso y confirme cualquier duda directamente con la agencia.',
          income:
            'Los límites y los ingresos que cuentan varían. Use las reglas actuales de la agencia; no envíe sus cifras al asistente.',
          household:
            'La definición de hogar depende del programa. Consulte la instrucción específica del formulario.',
          waitlist: 'Consulte la lista de espera y el estado de la solicitud con la agencia local.',
          'energy-crisis':
            'Si hay un corte urgente, contacte ahora a su proveedor y a la oficina de asistencia energética.',
        }
      : {
          'proof-alternatives':
            'If a proof item is missing, ask the agency which alternatives it accepts before the notice deadline.',
          interview:
            'Confirm with the agency how to attend or reschedule an interview, and keep a record of the contact.',
          timing:
            'Use the exact date in the notice and confirm uncertainty directly with the agency.',
          income:
            'Limits and countable income vary. Use the agency’s current rules; keep personal amounts out of assistant questions.',
          household:
            'The definition of a household depends on the program. Check the specific form instructions.',
          waitlist: 'Check the local agency’s waiting list and application status.',
          'energy-crisis':
            'For an urgent shutoff, contact the utility provider and local energy assistance office now.',
        };
  const extra = (focusAdvice as Partial<Record<FocusId, string>>)[request.focus] || '';
  const actionAdvice: Partial<Record<QuestionId, string>> =
    request.language === 'es'
      ? {
          apply:
            'Abra el recurso oficial y confirme qué solicitud y método de envío acepta la agencia. Un borrador en Anchor no es una solicitud enviada.',
          renew:
            'Revise el formulario de renovación, los comprobantes solicitados, la firma y cualquier entrevista. Prepare cada requisito en el Plan de acción.',
          documents:
            'Compare cada comprobante con el tipo y período solicitados en el aviso. Guarde una copia de lo que envíe y su recibo.',
          status:
            'Consulte el portal oficial o contacte a la agencia. Completar pasos en Anchor no confirma que la agencia haya procesado el caso.',
          appeal:
            'Revise las instrucciones de audiencia o apelación en el aviso y consulte a la agencia o un asesor autorizado. Confirme el plazo específico de su decisión.',
          reporting:
            'Use el canal oficial de la agencia para informar cambios. Guardar un registro en Anchor no informa el cambio a la agencia.',
        }
      : {
          apply:
            'Open the official resource and confirm the correct application and accepted submission method with the agency. An Anchor draft is not a submitted application.',
          renew:
            'Review the renewal form, requested proof, signature, and any interview. Prepare each requirement in the Action plan.',
          documents:
            'Match each proof item to the type and period requested in the notice. Keep a copy of what you submit and its receipt.',
          status:
            'Check the official portal or contact the agency. Completing Anchor steps does not confirm that the agency processed the case.',
          appeal:
            'Read the hearing or appeal instructions in the notice and contact the agency or an authorized adviser. Confirm the deadline specific to that decision.',
          reporting:
            'Use the agency’s official reporting channel for changes. Saving an Anchor record does not report the change to the agency.',
        };
  const action = actionAdvice[request.questionId] || '';
  return {
    mode: 'source-guidance',
    answer: `${request.language === 'es' ? knowledge.summaryEs : knowledge.summary}${action ? `\n\n${action}` : ''}${extra ? `\n\n${extra}` : ''}${request.program === 'navigation' ? '' : `\n\n${publicCaveat(request.language)}`}`,
    citations: knowledge.sources.map((item) => ({ ...item })),
    navigation: navigationFor(request),
    sourceVersion: SOURCE_VERSION,
    ...(message ? { message } : {}),
  };
}

export function geminiPrompt(request: AssistantRequest): string {
  const knowledge = knowledgeForRequest(request);
  return JSON.stringify({
    task: QUESTION_LABELS[request.questionId],
    focus: FOCUS_LABELS[request.focus],
    program: knowledge.label,
    language: request.language === 'es' ? 'Spanish' : 'English',
    requestedDestination: request.destination || null,
    sourceVersion: SOURCE_VERSION,
    sourceFacts: knowledge.facts,
    allowedCitations: knowledge.sources.map((item) => item.id),
    allowedNavigation: NAVIGATION_PAGES,
  });
}

export const GEMINI_SYSTEM_INSTRUCTION =
  'You explain public benefit-program processes and Anchor navigation. The input is a trusted, reconstructed public topic, not a personal case. Use ONLY the provided sourceFacts. Do not add eligibility thresholds, amounts, deadlines, personal decisions, legal/medical advice, promises, or facts from memory. If facts are insufficient, say what the agency needs to clarify. Answer in the requested language, in plain short paragraphs with practical next steps. Do not output URLs, HTML, markdown links, code, or numeric amounts/dates. Cite only provided source IDs that support the answer. For navigation no citation is needed; for program explanations include at least one allowed source ID. Suggest only an allowed page. Suggestions never execute actions. Return JSON {answer: string, citationIds: string[], navigationPage: string}. Maximum answer about 250 words. End program guidance with a reminder that the agency determines eligibility and applicable dates.';

/** Reject malformed output and invented citations/links instead of displaying it. */
export function normalizeGeminiResponse(
  raw: unknown,
  request: AssistantRequest,
): AssistantResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['answer', 'citationIds', 'navigationPage'].includes(key)))
    return null;
  if (
    typeof value.answer !== 'string' ||
    value.answer.trim().length < 20 ||
    value.answer.length > 5000 ||
    /https?:|www\.|[<>]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]|\$\s*\d|\d+\s*%|\b(?:you (?:definitely |automatically )?(?:qualify|are eligible)|guaranteed approval|calificas automaticamente|aprobacion garantizada)\b/i.test(
      value.answer,
    )
  )
    return null;
  const allowed = sourcesForRequest(request);
  if (
    !Array.isArray(value.citationIds) ||
    value.citationIds.length > allowed.length ||
    value.citationIds.some(
      (id) => typeof id !== 'string' || !allowed.some((item) => item.id === id),
    )
  )
    return null;
  if (request.program !== 'navigation' && !value.citationIds.length) return null;
  if (!validMember(value.navigationPage, NAVIGATION_PAGES)) return null;
  if (request.program === 'navigation' && value.navigationPage !== request.destination) return null;
  const ids = [...new Set(value.citationIds as string[])];
  return {
    mode: 'gemini',
    answer: value.answer.trim(),
    citations: ids.map((id) => ({ ...allowed.find((item) => item.id === id)! })),
    navigation: {
      page: value.navigationPage,
      label:
        request.language === 'es'
          ? PAGE_LABELS_ES[value.navigationPage]
          : PAGE_LABELS[value.navigationPage],
    },
    sourceVersion: SOURCE_VERSION,
  };
}

/**
 * Validate the whole Edge response again in the browser. A compromised,
 * stale, or mocked transport cannot introduce a new link or execute an intent.
 */
export function parseAssistantResponse(
  value: unknown,
  request: AssistantRequest,
): AssistantResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        !['mode', 'answer', 'citations', 'navigation', 'sourceVersion', 'message'].includes(key),
    )
  )
    return null;
  if (data.mode !== 'gemini' && data.mode !== 'source-guidance') return null;
  if (
    data.sourceVersion !== SOURCE_VERSION ||
    typeof data.answer !== 'string' ||
    data.answer.trim().length < 20 ||
    data.answer.length > 5000 ||
    /https?:|www\.|[<>]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(data.answer)
  )
    return null;
  if (
    data.message !== undefined &&
    (typeof data.message !== 'string' ||
      data.message.length > 1000 ||
      /https?:|[<>]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(data.message))
  )
    return null;
  const allowed = sourcesForRequest(request);
  if (!Array.isArray(data.citations) || data.citations.length > allowed.length) return null;
  const citations: Citation[] = [];
  for (const entry of data.citations) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['id', 'title', 'url'].includes(key))) return null;
    const canonical = allowed.find(
      (citation) =>
        citation.id === item.id && citation.title === item.title && citation.url === item.url,
    );
    if (!canonical || citations.some((citation) => citation.id === canonical.id)) return null;
    citations.push({ ...canonical });
  }
  if (data.mode === 'gemini' && request.program !== 'navigation' && !citations.length) return null;
  let navigation: AssistantResponse['navigation'] = null;
  if (data.navigation !== null) {
    if (!data.navigation || typeof data.navigation !== 'object' || Array.isArray(data.navigation))
      return null;
    const entry = data.navigation as Record<string, unknown>;
    if (
      Object.keys(entry).some((key) => !['page', 'label'].includes(key)) ||
      !validMember(entry.page, NAVIGATION_PAGES)
    )
      return null;
    const label = request.language === 'es' ? PAGE_LABELS_ES[entry.page] : PAGE_LABELS[entry.page];
    if (
      entry.label !== label ||
      (request.program === 'navigation' && entry.page !== request.destination)
    )
      return null;
    navigation = { page: entry.page, label };
  }
  return {
    mode: data.mode,
    answer: data.answer.trim(),
    citations,
    navigation,
    sourceVersion: SOURCE_VERSION,
    ...(typeof data.message === 'string' ? { message: data.message } : {}),
  };
}
