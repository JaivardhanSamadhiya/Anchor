/**
 * Reviewed public form content only. This module deliberately does not import
 * form drafts, notices, accounts, PDF selections, or any resident state.
 * The cloud receives identifiers; these saved official questions are the only
 * wording reconstructed for the provider.
 */
export const FORM_IDS = ['cf37', 'sar7b'] as const;
export const FORM_HELP_IDS = ['meaning', 'how-to-answer', 'documents'] as const;
export type FormId = (typeof FORM_IDS)[number];
export type FormHelp = (typeof FORM_HELP_IDS)[number];
export interface FormContext {
  formId: FormId;
  sectionId: string;
  fieldId?: string;
  help: FormHelp;
}
export interface FormCitation {
  id: string;
  title: string;
  url: string;
}
interface PublicField {
  label: string;
  question: string;
  guidance?: string;
  guidanceEs?: string;
}
interface PublicSection {
  title: string;
  question: string;
  guidance: string;
  guidanceEs: string;
  fields: Record<string, PublicField>;
}
interface PublicForm {
  label: string;
  revision: string;
  sources: FormCitation[];
  sections: Record<string, PublicSection>;
}
const fields = (ids: string[], label: string, question: string): Record<string, PublicField> =>
  Object.fromEntries(ids.map((id) => [id, { label, question }]));
const field = (label: string, question: string): PublicField => ({ label, question });
const cf37Url = 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf37.pdf';
const sar7bUrl =
  'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/Q-T/SAR7B.pdf?ver=2024-08-27-151418-733';
const sar7abUrl =
  'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/Q-T/SAR7AB.pdf?ver=2024-08-27-171357-980';

// Questions and instructions checked against the saved official PDFs and CDSS
// catalogues on 2026-10-11. This is an explanation aid, not an eligibility rule
// engine. Old form text about work rules is not used as current policy.
export const FORM_KNOWLEDGE: Record<FormId, PublicForm> = {
  cf37: {
    label: 'CF 37 · CalFresh recertification',
    revision: '11/16',
    sources: [{ id: 'cf37', title: 'CDSS: CalFresh recertification form CF 37', url: cf37Url }],
    sections: {
      identity: {
        title: 'Your case & contact details',
        question: 'Please give the county the best contact information to reach you.',
        guidance:
          'Copy the case name and case number from the county notice. Enter the mailing address and contact methods where the county can reach the household. Review the contact authorization and text-message choice on the official form. Keep these actual details in the form; Anchor AI only sees the public field identifier.',
        guidanceEs:
          'Copie el nombre y número de caso del aviso del condado. Escriba la dirección postal y los medios donde el condado puede contactar al hogar. Revise la autorización de contacto y la opción de mensajes de texto del formulario oficial. Los datos reales se quedan en el formulario; Anchor AI solo recibe el identificador público.',
        fields: {
          caseName: field('Case name', 'Case Name'),
          caseNumber: field('Case number', 'Case Number'),
          ...fields(
            ['mailingStreet', 'mailingCity', 'mailingState', 'mailingZip'],
            'Mailing address',
            'Mailing address, city, state, ZIP code',
          ),
          ...fields(
            ['homePhone', 'cellPhone', 'otherPhone'],
            'Contact phone',
            'Home phone, cell phone, work/alternate/message phone',
          ),
          email: field('Email address', 'Email address'),
          textConsent: field('County text messages', 'Check box for text'),
        },
      },
      household: {
        title: 'Household & address changes',
        question:
          'Has anyone moved into or out of your home (including newborns) in the last six months?',
        guidance:
          'For a move or newborn, complete the table with the move date, person, birth date, relationship, and whether you regularly buy and prepare food together. Report address changes for the same period. An authorized representative is a separate optional choice to help with the case or receive and spend benefits; read the responsibilities and identity-proof instruction before naming one.',
        guidanceEs:
          'Para una mudanza o un recién nacido, complete la tabla con la fecha, persona, fecha de nacimiento, parentesco y si compran y preparan alimentos juntos. Informe cambios de dirección del mismo período. Un representante autorizado es una opción aparte para ayudar con el caso o recibir y gastar beneficios; lea las responsabilidades y los requisitos de identidad antes de nombrarlo.',
        fields: {
          q1: field(
            'Household moves',
            'Has anyone moved into or out of your home (including newborns) in the last six months?',
          ),
          householdDetails: field(
            'Household table',
            'Date of move, name, date of birth, relationship to you, regularly purchase and prepare food together?',
          ),
          ...fields(
            ['q2', 'representativeName', 'representativePhone'],
            'Case representative',
            'Do you want to name someone to help you with your CalFresh case?',
          ),
          ...fields(
            ['q2b', 'spendingRepresentative'],
            'Benefits representative',
            'Do you want to name someone to receive and spend CalFresh benefits for your household?',
          ),
          ...fields(
            ['q3', 'newAddress', 'dateMoved', 'changedMailing'],
            'Address change',
            'Have there been any changes to your address in the last six months?',
          ),
        },
      },
      housing: {
        title: 'Housing & students',
        question:
          'If you have moved or have new/changed housing costs in the last six months, please fill out the section below.',
        guidance:
          'When the housing-change condition applies, enter current monthly rent or mortgage, and separately paid monthly property tax and home insurance. Check utilities paid outside housing costs. The form also asks about homelessness, shelter costs, and college or vocational students; student rows request school, enrollment and work information. These questions do not themselves decide student eligibility or promise an expense deduction.',
        guidanceEs:
          'Si corresponde la condición sobre cambios de vivienda, escriba el alquiler o hipoteca mensual actual y los impuestos y seguro del hogar pagados por separado. Marque los servicios pagados aparte. El formulario también pregunta sobre falta de vivienda, costos de alojamiento y estudiantes; las filas piden escuela, matrícula y trabajo. Estas preguntas no deciden la elegibilidad ni garantizan una deducción.',
        fields: {
          rent: field('Rent or mortgage', 'Your rent or mortgage per month now?'),
          propertyCosts: field(
            'Property costs',
            'If paid separately, your property taxes and home insurance per month now?',
          ),
          ...fields(
            ['utility1', 'utility2', 'utility3', 'utility4', 'utility5'],
            'Separate utility costs',
            'Do you have utility costs that are not included in your housing costs?',
          ),
          q5: field('Homelessness', 'Are you homeless?'),
          q5a: field('Shelter costs', 'If yes, do you pay shelter costs?'),
          ...fields(
            ['q6', 'studentDetails'],
            'Students',
            'Is anyone who is applying for benefits including you attending a college or vocational school?',
          ),
        },
      },
      income: {
        title: 'Income & expected changes',
        question: 'Do you or anyone you buy and prepare food with get income from a job (earned)?',
        guidance:
          'List each job for each person, including self-employment, with employer, pay frequency, monthly gross income before deductions, hours and whether it will continue. Attach proof requested by the form. The separate unearned-income table asks source, one-time or ongoing payment, amount and frequency; examples include Social Security and unemployment. Explain known job or income changes expected in the next six months and attach available proof. Ask the county about uncertain amounts or unavailable proof.',
        guidanceEs:
          'Anote cada trabajo de cada persona, incluido el trabajo por cuenta propia, empleador, frecuencia de pago, ingreso mensual bruto antes de deducciones, horas y si continuará. Adjunte los comprobantes pedidos. La tabla de ingresos no laborales pide fuente, si es un pago único o continuo, cantidad y frecuencia; por ejemplo Seguro Social o desempleo. Explique cambios conocidos esperados en los próximos seis meses y adjunte comprobantes disponibles. Consulte al condado sobre cantidades inciertas o comprobantes que faltan.',
        fields: {
          ...fields(
            ['q7', 'jobDetails'],
            'Job income',
            'Do you or anyone you buy and prepare food with get income from a job (earned)?',
          ),
          ...fields(
            ['q7a', 'jobChange'],
            'Expected job changes',
            'Will there be any changes to anyone’s job or income in the next six months?',
          ),
          ...fields(
            ['q8', 'otherIncome'],
            'Unearned income',
            'Do you or anyone you buy or prepare food with get income that does not come from a job (unearned)?',
          ),
          ...fields(
            ['q8a', 'otherIncomeChange'],
            'Expected other-income changes',
            'Will there be any changes to this income in the next six months?',
          ),
        },
      },
      expenses: {
        title: 'Expenses & health coverage',
        question:
          'Does anyone pay for care of a child, disabled adult, or other dependent so you or the other person can go to work, school, or look for a job?',
        guidance:
          'Read each expense condition. Medical costs concern a CalFresh recipient who is older or disabled and has new or increased costs; follow the exact proof condition on the form. Child support asks about payments and legal obligations. Dependent care asks only the household’s out-of-pocket amount for care that enables work, school or job search. Identify payer, dependent, amount and frequency as requested and attach relevant proof. The Medi-Cal interest question lets the county review information; it is not an approval.',
        guidanceEs:
          'Lea la condición de cada gasto. Los costos médicos se refieren a una persona mayor o con discapacidad que recibe CalFresh y tiene costos nuevos o aumentados; siga la condición exacta sobre comprobantes. La manutención pregunta por pagos y obligaciones legales. El cuidado pide solo lo que el hogar paga de su bolsillo para poder trabajar, estudiar o buscar trabajo. Anote persona, dependiente, cantidad y frecuencia y adjunte comprobantes. El interés en Medi-Cal permite una revisión del condado; no es una aprobación.',
        fields: {
          ...fields(
            ['q9', 'medicalDetails'],
            'Medical costs',
            'Did anyone who gets CalFresh and is 60 years old or older, or disabled, have an increase or begin paying medical costs?',
          ),
          ...fields(
            ['q10', 'childSupport'],
            'Child support',
            'Did anyone who gets CalFresh have to pay child support?',
          ),
          ...fields(
            ['q11', 'careDetails'],
            'Dependent or child care',
            'Does anyone pay for care of a child, disabled adult, or other dependent so you or the other person can go to work, school, or look for a job?',
          ),
          q12: field('Medi-Cal interest', 'Are you interested in applying for Medi-Cal?'),
        },
      },
      declarations: {
        title: 'Read the remaining questions',
        question:
          'Questions 13–18 concern duplicate benefits, trafficking, trading benefits, fleeing prosecution, and court findings about probation or parole.',
        guidance:
          'Use the full official wording of each question, including its conviction, court-finding, date and other conditions. A shortened label cannot tell you whether to choose yes or no. Anchor AI cannot make a legal determination or decide how a personal conviction applies. Ask the county or an authorized legal adviser when a condition is unclear, and complete any requested follow-up directly on the form.',
        guidanceEs:
          'Use el texto completo de cada pregunta, incluidas las condiciones sobre condenas, decisiones judiciales y fechas. Una etiqueta corta no determina si debe responder sí o no. Anchor AI no puede hacer una decisión legal ni decidir cómo se aplica una condena personal. Consulte al condado o a un asesor legal autorizado y complete cualquier información adicional directamente en el formulario.',
        fields: {
          ...fields(
            ['q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'declarationDetails'],
            'Remaining declarations',
            'Read the full conditions beside the selected declaration in the official form.',
          ),
        },
      },
      review: {
        title: 'Review, sign & return',
        question: 'Please read carefully, sign, and date.',
        guidance:
          'Check all applicable questions and table rows against the official form, including any extra sheets and requested proof. Read the certification and rights and responsibilities before the required adult household member, authorized representative or guardian signs and dates. Keep the county interview even if proof is missing and ask for help obtaining it. Use the county’s current submission instructions and notice date, keep a copy and receipt. An Anchor draft is unsigned and is not submitted.',
        guidanceEs:
          'Compare las preguntas y tablas con el formulario oficial, incluidas hojas adicionales y comprobantes. Lea la certificación, derechos y responsabilidades antes de que la persona requerida firme y feche. Acuda a la entrevista aunque falten comprobantes y pida ayuda para obtenerlos. Use las instrucciones actuales de envío y la fecha del aviso; guarde una copia y recibo. Un borrador de Anchor no está firmado ni enviado.',
        fields: {
          ...fields(
            [
              'proofPlan',
              'interviewPlan',
              'returnPlan',
              'originalReviewed',
              'tablesTransferred',
              'signatureNeeded',
            ],
            'Review and return',
            'Read the certification, sign and date, return the application and provide requested proof.',
          ),
        },
      },
    },
  },
  sar7b: {
    label: 'SAR 7B · Eligibility status report',
    revision: '12/23',
    sources: [
      { id: 'sar7b', title: 'CDSS: SAR 7B eligibility status report', url: sar7bUrl },
      { id: 'sar7ab', title: 'CDSS: SAR 7AB report instructions', url: sar7abUrl },
    ],
    sections: {
      report: {
        title: 'Your report period & contact details',
        question: 'Give us your contact information below.',
        guidance:
          'Use the report and submit months printed by the county. The report/data month is the month before the submit month; do not replace it with today’s month. Write current contact details on the actual form. If there is no permanent address, read the mailing options and arrange county mail or General Delivery with that office first. Follow the program symbols to see which questions apply. Ask the county about an unclear reporting period or submission date.',
        guidanceEs:
          'Use los meses de informe y envío indicados por el condado. El mes de informe es el anterior al mes de envío; no lo sustituya por el mes actual. Escriba los datos de contacto en el formulario. Si no tiene dirección permanente, revise las opciones postales y acuerde el servicio con el condado o correo primero. Siga los símbolos del programa y consulte al condado sobre períodos o fechas inciertas.',
        fields: {
          ...fields(
            ['reportMonth', 'submitMonth'],
            'Report period',
            'Write your submit month here; use the report month requested by the county.',
          ),
          caseName: field('Case name', 'Case Name'),
          caseNumber: field('Case number', 'Case Number'),
          contactDetails: field('Contact information', 'Give us your contact information below.'),
        },
      },
      household: {
        title: 'Household changes',
        question:
          'Has anyone moved into or out of your home or did you move in with someone since you last reported?',
        guidance:
          'Report household changes since the last report as instructed, such as a newborn, moving in or out, temporary absence, or starting or stopping buying and making food together. Fill the table with name, birth date, relationship, change and change date; the food-together column is for CalFresh. Cash-aid assistance units and CalFresh households have different definitions. Use the included SAR 7AB instructions and ask the county who belongs in the report if uncertain.',
        guidanceEs:
          'Informe cambios desde el último informe según las instrucciones: nacimiento, mudanza, ausencia temporal o empezar o dejar de comprar y preparar alimentos juntos. Complete nombre, nacimiento, parentesco, cambio y fecha; la columna de alimentos es para CalFresh. La unidad de asistencia monetaria y el hogar de CalFresh tienen definiciones diferentes. Use las instrucciones SAR 7AB y consulte al condado si no sabe a quién incluir.',
        fields: {
          ...fields(
            ['householdChanged', 'householdDetails'],
            'Household changes',
            'Has anyone moved into or out of your home or did you move in with someone since you last reported?',
          ),
        },
      },
      income: {
        title: 'Income & proof',
        question:
          'Did anyone in your household get earned or unearned income for your report month, or does anyone expect to have a change in earned or unearned income within the next six months?',
        guidance:
          'Use the county’s report month. List the person, what happened and date, employer or income source, pay frequency, total gross income received before deductions, dates received and hours if employed. Earned income comes from work; unearned income includes Social Security or unemployment. Attach required proof such as pay stubs, employer statements, self-employment records or award letters. The form offers a missing-proof/help checkbox. For fluctuating income and expected changes, follow SAR 7AB or ask the county instead of guessing.',
        guidanceEs:
          'Use el mes indicado por el condado. Anote persona, cambio y fecha, empleador o fuente, frecuencia de pago, total bruto recibido antes de deducciones, fechas de pago y horas si trabaja. Los ingresos laborales vienen del trabajo; otros incluyen Seguro Social o desempleo. Adjunte comprobantes como recibos, declaraciones del empleador, registros propios o cartas de beneficios. Hay una opción para pedir ayuda con comprobantes. Para ingresos variables o cambios esperados, siga SAR 7AB o consulte al condado.',
        fields: {
          incomeDetails: field(
            'Income received and changes',
            'Did anyone in your household get earned or unearned income for your report month, or does anyone expect to have a change in earned or unearned income within the next six months?',
          ),
          incomeProof: field(
            'Income proof',
            'Did you attach proof for the income change(s) listed above?',
          ),
        },
      },
      resources: {
        title: 'Resources & expenses',
        question:
          'Has anyone in your household had a change in resources or new resources since the last time you reported?',
        guidance:
          'Read the CalFresh-only applicability conditions before completing resources. Reporting resources is not required of every CalFresh household; the county can tell you whether those conditions apply. Applicable rows ask person, resource type, transaction, value and date, plus proof or a request for help getting proof. The form says vehicles are not counted for CalFresh. Expenses have separate instructions: an address change requires new housing and utility information; otherwise the expense section is optional and may affect benefits.',
        guidanceEs:
          'Lea las condiciones de CalFresh antes de completar recursos. No todos los hogares deben informar recursos; el condado puede aclarar si le corresponde. Las filas piden persona, tipo, transacción, valor, fecha y comprobante o ayuda. El formulario indica que los vehículos no cuentan para CalFresh. Los gastos tienen instrucciones aparte: un cambio de dirección requiere nuevos costos de vivienda y servicios; si no cambió la dirección, es opcional y puede afectar beneficios.',
        fields: {
          resourceQuestions: field(
            'Resources',
            'Has anyone in your household had a change in resources or new resources since the last time you reported?',
          ),
          expenseDetails: field(
            'Expenses',
            'Have your expenses changed? Has your address changed?',
          ),
        },
      },
      expenses: {
        title: 'Housing & other expenses',
        question: 'What is your monthly rent or mortgage payment?',
        guidance:
          'This section is for CalFresh. If the address changed since the last report, report new housing and utility expenses. Otherwise reporting expenses is optional and could affect benefits. List the monthly rent or mortgage, separately paid utility and housing costs, dependent-care costs and child support paid as requested. Medical costs have age or disability conditions; read those before completing that part. Provide requested proof or ask the county for help obtaining it. Do not calculate or promise an increase.',
        guidanceEs:
          'Esta sección es para CalFresh. Si cambió la dirección, informe los nuevos costos de vivienda y servicios. En otro caso es opcional y puede afectar beneficios. Anote alquiler o hipoteca mensual, servicios y costos de vivienda separados, cuidado de dependientes y manutención pagada según se pide. Los costos médicos tienen condiciones de edad o discapacidad. Adjunte comprobantes o pida ayuda al condado. No calcule ni espere un aumento garantizado.',
        fields: {
          expenseDetails: field(
            'Expenses',
            'Have your expenses changed? Has your address changed?',
          ),
        },
      },
      remaining: {
        title: 'Remaining questions',
        question:
          'Review the gambling or lottery, work requirement, outstanding warrant/probation or parole, and life-events sections for your program.',
        guidance:
          'Follow each program symbol and mandatory or optional label. The gambling question applies to CalFresh; warrant and life-event sections are for cash aid. Read the complete questions and conditions. Work rules and exemptions can change after a form revision; ask the county for current applicability instead of using old form ages or exemptions as current rules. Anchor AI cannot determine a personal legal status or choose an answer. Attach requested proof or seek county help.',
        guidanceEs:
          'Siga los símbolos y las etiquetas obligatorias u opcionales. La pregunta de apuestas corresponde a CalFresh; órdenes judiciales y eventos de vida corresponden a asistencia monetaria. Lea las condiciones completas. Las reglas de trabajo pueden cambiar después de una revisión; consulte al condado sobre las reglas actuales. Anchor AI no decide situaciones legales ni elige respuestas. Adjunte comprobantes o solicite ayuda.',
        fields: {
          remainingQuestions: field(
            'Remaining questions',
            'Read the full remaining questions and their program applicability on the official form.',
          ),
        },
      },
      review: {
        title: 'Review, sign & return',
        question: 'You need to sign and date this form, or it will be considered incomplete.',
        guidance:
          'Answer all required questions, attach required proof and extra sheets, and read the certification. For CalFresh, the head of household, responsible household member or authorized representative signs. Cash aid can require both parents or other applicable adults to sign; follow the form’s signer instructions. Use the county’s report and submit months and an accepted submission channel, such as BenefitsCal. Keep a copy and confirmation. An Anchor preparation draft is unsigned and not submitted.',
        guidanceEs:
          'Responda las preguntas obligatorias, adjunte comprobantes y hojas adicionales y lea la certificación. Para CalFresh firma la persona principal del hogar, un miembro responsable o representante autorizado. La asistencia monetaria puede requerir firmas de ambos padres u otros adultos; siga las instrucciones. Use los meses del condado y un canal aceptado, como BenefitsCal. Guarde copia y confirmación. Un borrador de Anchor no está firmado ni enviado.',
        fields: {
          ...fields(
            ['returnPlan', 'originalReviewed', 'signatureNeeded'],
            'Sign and return',
            'You need to sign and date this form, or it will be considered incomplete.',
          ),
        },
      },
    },
  },
};

export function parseFormContext(value: unknown): FormContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['formId', 'sectionId', 'fieldId', 'help'].includes(key)))
    return null;
  if (
    typeof data.formId !== 'string' ||
    !FORM_IDS.includes(data.formId as FormId) ||
    typeof data.sectionId !== 'string' ||
    typeof data.help !== 'string' ||
    !FORM_HELP_IDS.includes(data.help as FormHelp)
  )
    return null;
  const form = FORM_KNOWLEDGE[data.formId as FormId];
  if (!Object.hasOwn(form.sections, data.sectionId)) return null;
  const section = form.sections[data.sectionId];
  if (
    data.fieldId !== undefined &&
    (typeof data.fieldId !== 'string' || !Object.hasOwn(section.fields, data.fieldId))
  )
    return null;
  return {
    formId: data.formId as FormId,
    sectionId: data.sectionId,
    ...(typeof data.fieldId === 'string' ? { fieldId: data.fieldId } : {}),
    help: data.help as FormHelp,
  };
}

export const FORM_HELP_LABELS: Record<FormHelp, string> = {
  meaning: 'Explain what the official question means.',
  'how-to-answer':
    'Explain how to complete this part of the official form without choosing personal answers.',
  documents:
    'Explain which proof the official instructions discuss and how to ask for help obtaining it.',
};

export function formContextPreview(context: FormContext, language: 'en' | 'es' = 'en'): string {
  const valid = parseFormContext(context);
  if (!valid) return '';
  const form = FORM_KNOWLEDGE[valid.formId];
  const section = form.sections[valid.sectionId];
  const label = valid.fieldId ? section.fields[valid.fieldId].label : section.title;
  const help =
    language === 'es'
      ? { meaning: 'Qué significa', 'how-to-answer': 'Cómo completar', documents: 'Comprobantes' }[
          valid.help
        ]
      : { meaning: 'What it means', 'how-to-answer': 'How to answer', documents: 'Documents' }[
          valid.help
        ];
  return `${form.label} · ${label} · ${help}`;
}

export function publicFormKnowledge(context: FormContext, language: 'en' | 'es' = 'en') {
  const valid = parseFormContext(context);
  if (!valid) return null;
  const form = FORM_KNOWLEDGE[valid.formId];
  const section = form.sections[valid.sectionId];
  const selected = valid.fieldId ? section.fields[valid.fieldId] : null;
  return {
    label: form.label,
    revision: form.revision,
    section: section.title,
    question: selected?.question || section.question,
    task: FORM_HELP_LABELS[valid.help],
    guidance: language === 'es' ? section.guidanceEs : section.guidance,
    sources: form.sources.map((item) => ({ ...item })),
  };
}
