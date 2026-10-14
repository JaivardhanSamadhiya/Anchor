/** Interpret a resident's question on this device before considering a public
 * AI request. Never substitute an unrelated selected field for an unknown
 * question, and never return the question text as a cloud request parameter. */
import { FORM_KNOWLEDGE, parseFormContext, type FormContext } from './program-assistant.js';

export type FormQuestionResolution =
  | { kind: 'request'; context: FormContext }
  | { kind: 'postal-lookup'; zip: string }
  | {
      kind: 'local';
      answer: string;
      citations: { title: string; url: string }[];
      awaitingPostalCity?: boolean;
    };
const USPS_LOOKUP = 'https://tools.usps.com/go/ZipLookup.htm';
const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function resolveFormQuestion(
  question: string,
  context: FormContext,
  language: 'en' | 'es',
  awaitingPostalCity = false,
): FormQuestionResolution {
  const text = normalize(question.slice(0, 500));
  const t = (en: string, es: string) => (language === 'es' ? es : en);
  const local = (answer: string, postal = false): FormQuestionResolution => ({
    kind: 'local',
    answer,
    citations: postal
      ? [
          {
            title: t(
              'USPS: ZIP code and mailing-city lookup',
              'USPS: consulta de código postal y ciudad postal',
            ),
            url: USPS_LOOKUP,
          },
        ]
      : [],
    ...(postal ? { awaitingPostalCity: true } : {}),
  });
  // Only explicitly labelled ZIPs or a bare ZIP in a pending city dialogue
  // become lookups. A five-digit house/case number is never treated as a ZIP.
  const labelled = [
    ...text.matchAll(
      /\b(?:zip\s*(?:code)?|postal code|codigo postal)\s*(?:(?:is|es)\s*)?(\d{5})(?:\s+\d{4})?\b/g,
    ),
  ].map((match) => match[1]);
  const bare = awaitingPostalCity
    ? /^(\d{5})(?:\s+\d{4})?(?:\s+(?:ca|california))?$/.exec(text)?.[1]
    : undefined;
  const postalField = [
    'mailingCity',
    'mailingState',
    'mailingZip',
    'mailingStreet',
    'contactDetails',
  ].includes(context.fieldId || '');
  const cityRequest = /\b(?:city|town|mailing|address|ciudad|direccion)\b/.test(text);
  const wantsLookup =
    !/\b(?:mean|meaning|definition|significa|significado)\b/.test(text) &&
    (awaitingPostalCity || cityRequest || postalField);
  if (wantsLookup && (labelled.length || bare)) {
    const codes = [...new Set([...labelled, ...(bare ? [bare] : [])])];
    if (codes.length !== 1 || /\b(?:or|o)\s+\d{5}\b/.test(text))
      return local(
        t(
          'Which single ZIP code should I check? Confirm it on your mailing address before continuing.',
          '¿Qué código postal debo consultar? Confirma un solo código de tu dirección postal antes de continuar.',
        ),
        true,
      );
    return { kind: 'postal-lookup', zip: codes[0] };
  }
  // A street name can recur in multiple places. This is a missing-facts
  // question, not a request to explain the address label or guess a location.
  const asksDefinition =
    /\b(?:mean|means|meaning|definition|significa|significado|definicion)\b/.test(text);
  if (
    !asksDefinition &&
    /\b(?:what|which)\b.*\b(?:city|town|zip(?: code)?|state)\b|\b(?:my (?:mailing )?city|city for|zip for|what city|which city)\b|\b(?:que|cual)\b.*\b(?:ciudad|codigo postal|estado)\b|\bmi ciudad\b/.test(
      text,
    )
  ) {
    const hasZip = /\b\d{5}(?: \d{4})?\b/.test(text);
    return local(
      hasZip
        ? t(
            'I cannot verify the mailing city or state from this message alone. Check the city and state for that ZIP code in the USPS lookup, and compare them with your complete mailing address or a recent piece of mail. A ZIP code can have more than one accepted city name; this does not verify your street address.',
            'No puedo verificar la ciudad o estado postal solo con este mensaje. Consulta la ciudad y estado de ese código en USPS y compáralos con tu dirección completa o correo reciente. Un código postal puede tener más de un nombre de ciudad aceptado; esto no verifica tu dirección.',
          )
        : t(
            'A street address alone is not enough to identify your mailing city reliably. What ZIP code and state are associated with it? Check a recent piece of mail or use the USPS lookup to verify the mailing city. I have not looked up or shared your address.',
            'Una dirección de calle sola no basta para identificar tu ciudad postal con seguridad. ¿Qué código postal y estado corresponden? Revisa correo reciente o usa la consulta de USPS para verificar la ciudad postal. No he buscado ni compartido tu dirección.',
          ),
      true,
    );
  }
  if (
    /\b(?:should i|do i|can i)\b.*\b(?:put|choose|mark|answer)\b.*\b(?:yes|no)\b|\b(?:debo|puedo)\b.*\b(?:marcar|responder)\b.*\b(?:si|no)\b/.test(
      text,
    )
  )
    return local(
      t(
        'I can explain what the form asks, but I cannot choose yes or no from your personal situation. Which condition in the question is unclear? Tell me the question number or use its Ask Anchor button so I can explain the relevant wording.',
        'Puedo explicar qué pide el formulario, pero no elegir sí o no según tu situación personal. ¿Qué condición no está clara? Indica el número de pregunta o usa su botón Pregunta a Anchor para explicar el texto correspondiente.',
      ),
    );
  const help =
    /\b(?:proof|document|evidence|paystub|paystubs|comprobante|comprobantes|documento|documentos)\b/.test(
      text,
    )
      ? 'documents'
      : /\b(?:fill|answer|enter|write|llenar|responder|escribir)\b/.test(text)
        ? 'how-to-answer'
        : 'meaning';
  const choose = (
    sectionId: string,
    fields: string[] = [],
    specifiedHelp = help,
  ): FormQuestionResolution | null => {
    for (const fieldId of fields) {
      const selected = parseFormContext({
        formId: context.formId,
        sectionId,
        fieldId,
        help: specifiedHelp,
      });
      if (selected) return { kind: 'request', context: selected };
    }
    const selected = parseFormContext({ formId: context.formId, sectionId, help: specifiedHelp });
    return selected ? { kind: 'request', context: selected } : null;
  };
  let resolved: FormQuestionResolution | null = null;
  const questionNumber = text.match(/\b(?:question|q|pregunta)\s*(\d{1,2}[a-z]?)\b/);
  if (questionNumber) {
    const fieldId = `q${questionNumber[1]}`;
    for (const [sectionId, section] of Object.entries(FORM_KNOWLEDGE[context.formId].sections)) {
      if (Object.hasOwn(section.fields, fieldId)) {
        const match = choose(sectionId, [fieldId]);
        if (match) return match;
      }
    }
    return local(
      t(
        'Which wording in that numbered question is unclear? Select its Ask Anchor button or choose the relevant question from the list. I could not identify a reviewed field for that number.',
        '¿Qué texto de esa pregunta numerada no está claro? Usa su botón Pregunta a Anchor o elige la pregunta de la lista. No pude identificar un campo revisado para ese número.',
      ),
    );
  }
  if (
    /\b(?:gross|net|take home|before deductions|after deductions|before taxes|after taxes|bruto|brutos|neto|netos|antes de impuestos|despues de impuestos)\b/.test(
      text,
    )
  )
    resolved = choose(
      'income',
      context.formId === 'cf37' ? ['job1Gross', 'jobDetails'] : ['income1Gross', 'incomeDetails'],
      'meaning',
    );
  else if (
    /\b(?:report month|reporting month|report period|reporting period|submit month|data month|mes de informe|mes del informe|periodo de informe|mes de envio)\b/.test(
      text,
    )
  ) {
    if (context.formId === 'sar7b')
      resolved = choose(
        'report',
        [/submit month|mes de envio/.test(text) ? 'submitMonth' : 'reportMonth'],
        'meaning',
      );
    else
      return local(
        t(
          'Are you asking about the report month on SAR 7, or a period named in your renewal notice? You are currently preparing CF 37. Check the document that names the period; I should not replace it with the current month.',
          '¿Preguntas por el mes de informe de SAR 7 o un período indicado en tu aviso de renovación? Ahora preparas CF 37. Revisa el documento que indica el período; no debe sustituirse por el mes actual.',
        ),
      );
  } else if (
    /\b(?:income|paystub|paystubs|wage|wages|salary|ingreso|ingresos|sueldo|salario|nomina)\b/.test(
      text,
    )
  )
    resolved = choose(
      'income',
      context.formId === 'cf37' ? ['jobDetails'] : ['incomeProof', 'incomeDetails'],
    );
  else if (
    /\b(?:household|roommate|buy and prepare|hogar|companero de casa|comprar y preparar)\b/.test(
      text,
    )
  )
    resolved = choose('household', context.formId === 'cf37' ? ['q1'] : ['householdChanged']);
  else if (
    /\b(?:mailing|address|city|zip|state|postal|direccion|ciudad|estado|codigo postal)\b/.test(text)
  )
    resolved = choose(
      context.formId === 'cf37' ? 'identity' : 'report',
      context.formId === 'cf37'
        ? [
            /\b(?:zip|codigo postal)\b/.test(text)
              ? 'mailingZip'
              : /\b(?:state|estado)\b/.test(text)
                ? 'mailingState'
                : /\b(?:city|ciudad)\b/.test(text)
                  ? 'mailingCity'
                  : 'mailingStreet',
          ]
        : ['contactDetails'],
    );
  else if (
    /\b(?:property taxes|home insurance|rent|mortgage|utility|utilities|alquiler|hipoteca|servicios|impuestos de propiedad|seguro del hogar)\b/.test(
      text,
    )
  )
    resolved = choose(
      context.formId === 'cf37' ? 'housing' : 'expenses',
      context.formId === 'cf37'
        ? [
            /property taxes|home insurance|impuestos de propiedad|seguro del hogar/.test(text)
              ? 'propertyCosts'
              : 'rent',
          ]
        : ['expenseDetails'],
    );
  else if (
    /^(?:explain (?:this(?: question|field|part)?|the (?:selected|highlighted) (?:question|field|part))|what does (?:this(?: question|field|part)?|it) mean|what is this(?: question|field|part)?|how (?:do|can|should) i (?:answer|fill|complete|write)(?: (?:this(?: question|field|part)?|it|here))?|what (?:should|do) i (?:enter|write)(?: here| for this(?: question|field|part)?)?|which (?:proof|documents)(?: are needed(?: here| for this(?: question|field|part)?)?)?|explica (?:esta pregunta|este campo|esto)|que significa (?:esta pregunta|este campo|esto)|como (?:respondo|completo|lleno)(?: esta pregunta| este campo| esto)?|que escribo(?: aqui| en este campo)?)$/.test(
      normalize(question.replace(/^[¿¡]/, '').split(/[?.!]/)[0]),
    )
  ) {
    const selected = parseFormContext({ ...context, help });
    if (selected) resolved = { kind: 'request', context: selected };
  }
  return (
    resolved ||
    local(
      t(
        'I could not connect that question to a reviewed form topic. Which part of the form are you asking about? Use its Ask Anchor button, or ask about an address field, gross income, reporting month, requested proof, household members or housing costs.',
        'No pude relacionar esa pregunta con un tema revisado del formulario. ¿Sobre qué parte preguntas? Usa su botón Pregunta a Anchor o pregunta sobre dirección, ingresos brutos, mes de informe, comprobantes, miembros del hogar o costos de vivienda.',
      ),
    )
  );
}
