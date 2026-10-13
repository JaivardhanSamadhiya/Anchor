/** Interpret a resident's question on this device before considering a public
 * AI request. Never substitute an unrelated selected field for an unknown
 * question, and never return the question text as a cloud request parameter. */
import { parseFormContext, type FormContext } from './program-assistant.js';

export type FormQuestionResolution =
  | { kind: 'request'; context: FormContext }
  | { kind: 'local'; answer: string; citations: { title: string; url: string }[] };
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
  });
  // A street name can recur in multiple places. This is a missing-facts
  // question, not a request to explain the address label or guess a location.
  const asksDefinition =
    /\b(?:mean|means|meaning|definition|significa|significado|definicion)\b/.test(text);
  if (
    !asksDefinition &&
    /\b(?:what|which)\b.*\b(?:city|town|zip(?: code)?|state)\b|\b(?:my city|city for|zip for|what city|which city)\b|\b(?:que|cual)\b.*\b(?:ciudad|codigo postal|estado)\b|\bmi ciudad\b/.test(
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
  if (
    /\b(?:gross|net|take home|before deductions|before taxes|after taxes|bruto|brutos|neto|netos|deducciones|impuestos)\b/.test(
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
  else if (/\b(?:mailing|address|city|zip|postal|direccion|ciudad|codigo postal)\b/.test(text))
    resolved = choose(
      context.formId === 'cf37' ? 'identity' : 'report',
      context.formId === 'cf37'
        ? [/\bcity|ciudad\b/.test(text) ? 'mailingCity' : 'mailingStreet']
        : ['contactDetails'],
    );
  else if (/\b(?:rent|mortgage|utility|utilities|alquiler|hipoteca|servicios)\b/.test(text))
    resolved = choose(
      context.formId === 'cf37' ? 'housing' : 'expenses',
      context.formId === 'cf37' ? ['rent'] : ['expenseDetails'],
    );
  else if (
    /^(?:explain (?:this|the question)|what does (?:this|it)|what is (?:this|it)|how (?:do|can|should) i (?:answer|fill|complete|write)|what (?:should|do) i (?:enter|write)|which (?:proof|documents)|explica (?:esta|esto)|que significa (?:esta|esto)|como (?:respondo|completo|lleno)|que (?:escribo|comprobantes))\b/.test(
      text,
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
