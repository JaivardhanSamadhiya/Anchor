/**
 * Spanish app guidance for the reviewed CF37/SAR7 flow. These translations are
 * not an official Spanish form; the original PDF and all field mappings remain
 * unchanged. Unknown case-specific text stays verbatim instead of being guessed.
 */
import type { FormAssistance } from './form-assistance.js';

const WORDING: Readonly<Record<string, string>> = {
  'Your case & contact details': 'Tu caso y datos de contacto',
  'Use the case details and contact information requested by your county.':
    'Usa los datos del caso y la información de contacto que solicita tu condado.',
  'Household & address changes': 'Cambios del hogar y domicilio',
  'Use the last six months. The form has three household rows; use Additional information for more people.':
    'Usa los últimos seis meses. El formulario tiene tres filas para personas del hogar; usa Información adicional para más personas.',
  'Housing & students': 'Vivienda y estudiantes',
  'Q4 applies when housing or costs changed. Q5–6 are on PDF page 9.':
    'La pregunta Q4 corresponde si cambió la vivienda o sus gastos. Las preguntas Q5–6 están en la página 9 del PDF.',
  'Income & expected changes': 'Ingresos y cambios previstos',
  'List each job and each income source. Attach proof as the form requests.':
    'Anota cada empleo y cada fuente de ingresos. Adjunta comprobantes según lo solicita el formulario.',
  'Expenses & health coverage': 'Gastos y cobertura médica',
  'Read the conditions beside each expense question on the form.':
    'Lee las condiciones junto a cada pregunta sobre gastos en el formulario.',
  'Read the remaining questions': 'Lee las preguntas restantes',
  'Use the exact wording of Q13–18 in the PDF. Ask your county if a question is unclear.':
    'Consulta el texto exacto de las preguntas Q13–18 en el PDF. Pregunta al condado si alguna no está clara.',
  'Review, sign & return': 'Revisa, firma y entrega',
  'All 11 pages remain in your editable PDF. Review every applicable question, gather proof, and sign and date the certification yourself.':
    'Las 11 páginas permanecen en tu PDF editable. Revisa cada pregunta que corresponda, reúne los comprobantes y firma y fecha la certificación personalmente.',
  'Report period & contact details': 'Período del informe y datos de contacto',
  'Use the report and submit months on your county notice. Contact details are on page 3; optional disability assistance is on page 2.':
    'Usa los meses de informe y entrega indicados en el aviso del condado. Los datos de contacto están en la página 3; la ayuda opcional por discapacidad está en la página 2.',
  'Household changes': 'Cambios del hogar',
  'Report changes since you last reported. The form contains two household rows; attach a separate sheet for more people.':
    'Informa los cambios desde tu último informe. El formulario tiene dos filas para personas del hogar; adjunta una hoja adicional para más personas.',
  'Income & proof': 'Ingresos y comprobantes',
  'Use gross amounts for your report month. Four income rows span pages 5–7; attach more pages if needed.':
    'Usa cantidades brutas correspondientes al mes del informe. Hay cuatro filas de ingresos en las páginas 5–7; adjunta más hojas si las necesitas.',
  'Resources & proof': 'Recursos y comprobantes',
  'Read the conditions on page 8 before completing this section. Ask your county if resource reporting applies to your household.':
    'Lee las condiciones de la página 8 antes de completar esta sección. Pregunta al condado si tu hogar debe informar recursos.',
  Expenses: 'Gastos',
  'If your address changed, report new housing and utility costs. Read the medical-cost conditions on page 11.':
    'Si cambió tu domicilio, informa los nuevos gastos de vivienda y servicios. Lee las condiciones sobre gastos médicos en la página 11.',
  'Remaining questions': 'Preguntas restantes',
  'Review pages 11–13. Work-requirement questions are optional; confirm current requirements with your county. Cash-aid questions apply only if you get cash aid.':
    'Revisa las páginas 11–13. Las preguntas sobre requisitos de trabajo son opcionales; confirma los requisitos actuales con el condado. Las preguntas sobre ayuda monetaria corresponden solo si recibes esa ayuda.',
  'Download all 14 pages as an editable unsigned PDF. Read the certification, sign and date yourself, attach proof and any extra sheets, then return through an accepted county channel. Page 2 also contains optional requests to stop benefits; review it directly if you want to make that request.':
    'Descarga las 14 páginas como PDF editable sin firma. Lee la certificación, firma y fecha personalmente, adjunta comprobantes y hojas adicionales y entrégalo por un canal aceptado del condado. La página 2 también contiene solicitudes opcionales para detener beneficios; revísala directamente si deseas solicitarlo.',
  'Understand this request': 'Comprende esta solicitud',
  'Use the original wording to identify what the agency needs.':
    'Usa el texto original para identificar lo que necesita la agencia.',
  'Prepare the item': 'Prepara el documento',
  'Attach your actual form or document to read it here. Keep uncertain answers for agency review.':
    'Adjunta tu formulario o documento real para leerlo aquí. Deja las respuestas inciertas para revisarlas con la agencia.',
  'Review & return': 'Revisa y entrega',
  'Use an accepted submission channel and keep its confirmation.':
    'Usa un canal de entrega aceptado y conserva la confirmación.',
  'This form number appears in the request or notice. Compare it with the form your county supplied.':
    'Este número de formulario aparece en la solicitud o el aviso. Compáralo con el formulario que te proporcionó el condado.',
  'A specific official form has not been verified for this request. Use the actual form supplied by the agency.':
    'No se ha verificado un formulario oficial específico para esta solicitud. Usa el formulario real proporcionado por la agencia.',
  'Read the full question in the official form before choosing an answer.':
    'Lee la pregunta completa en el formulario oficial antes de elegir una respuesta.',
  'Read the matching question and conditions on the official form.':
    'Lee la pregunta correspondiente y sus condiciones en el formulario oficial.',
  'Use six digits: MMDDYY. The official form supplies the date separators.':
    'Usa seis dígitos: MMDDYY (mes, día y año de dos dígitos). El formulario oficial incluye los separadores.',
  'Written on the official Notes page (PDF page 7). Identify the question number for each extra answer.':
    'Se escribe en la página oficial de notas (página 7 del PDF). Indica el número de pregunta para cada respuesta adicional.',
  'Check the request and date': 'Verifica la solicitud y la fecha',
  'Compare the original notice, form number and due date before preparing anything.':
    'Compara el aviso original, el número de formulario y la fecha límite antes de preparar los documentos.',
  'Complete the actual form': 'Completa el formulario real',
  'Transfer any separate notes, answer applicable questions and review each page.':
    'Transfiere las notas que estén por separado, responde las preguntas que correspondan y revisa cada página.',
  'Gather the requested proof': 'Reúne los comprobantes solicitados',
  'Use the notice and form to identify the relevant people, dates and documents.':
    'Usa el aviso y el formulario para identificar las personas, fechas y documentos pertinentes.',
  'Read, sign and date': 'Lee, firma y fecha',
  'Anchor leaves signatures blank. Use the signature method accepted by your agency.':
    'Anchor deja las firmas en blanco. Usa el método de firma que acepta tu agencia.',
  'Return it through an accepted channel': 'Entrégalo por un canal aceptado',
  'Confirm the county’s instructions, keep a copy and save its submission confirmation.':
    'Confirma las instrucciones del condado, conserva una copia y guarda la confirmación de entrega.',
  'Keep your interview appointment': 'Asiste a tu entrevista',
  'Use the county’s appointment instructions and ask for help obtaining missing proof.':
    'Sigue las instrucciones de la cita del condado y pide ayuda para obtener los comprobantes que falten.',
  'Check the original request': 'Verifica la solicitud original',
  'Confirm the form or evidence requested and check the notice’s due date.':
    'Confirma el formulario o comprobante solicitado y verifica la fecha límite del aviso.',
  'Match the income period': 'Verifica el período de ingresos',
  'Match the people, pay periods and dates requested. Ask which proof is accepted if yours is unavailable.':
    'Verifica que coincidan las personas, períodos de pago y fechas solicitados. Pregunta qué comprobante se acepta si no tienes el tuyo.',
  'Check readability and completeness': 'Verifica la legibilidad y que esté completo',
  'Include all requested pages and review any required signatures. Do not add unrelated personal information.':
    'Incluye todas las páginas solicitadas y revisa las firmas requeridas. No agregues información personal que no corresponda.',
  'Return it and keep proof': 'Entrégalo y conserva el comprobante',
  'Confirm where to submit, keep a copy and save the agency’s confirmation.':
    'Confirma dónde entregarlo, conserva una copia y guarda la confirmación de la agencia.',
  'Case name': 'Nombre del caso',
  'Case number': 'Número de caso',
  'Mailing street address': 'Dirección postal',
  City: 'Ciudad',
  State: 'Estado',
  'ZIP code': 'Código postal',
  'Home phone': 'Teléfono de casa',
  'Cell phone': 'Teléfono celular',
  'Work, alternate or message phone': 'Teléfono del trabajo, alternativo o para mensajes',
  'Email address': 'Correo electrónico',
  'I choose to allow county text messages': 'Autorizo mensajes de texto del condado',
  'Has anyone moved into or out of your home?': '¿Alguien se mudó a tu hogar o salió de él?',
  'Moved in or out?': '¿Se mudó al hogar o salió de él?',
  'Date of move': 'Fecha de mudanza',
  'Full name': 'Nombre completo',
  'Date of birth': 'Fecha de nacimiento',
  'Relationship to you': 'Parentesco contigo',
  'Buy and prepare food together?': '¿Compran y preparan alimentos juntos?',
  'Do you want someone to help with your case?': '¿Quieres que alguien te ayude con tu caso?',
  'Case helper’s name': 'Nombre de quien ayuda con el caso',
  'Case helper’s phone': 'Teléfono de quien ayuda con el caso',
  'Do you want someone to receive and spend benefits?':
    '¿Quieres que alguien reciba y use los beneficios?',
  'Benefits representative': 'Representante de beneficios',
  Name: 'Nombre',
  Phone: 'Teléfono',
  'Street address': 'Dirección',
  'Has your address changed?': '¿Cambió tu domicilio?',
  'New address': 'Nuevo domicilio',
  'Date moved': 'Fecha de mudanza',
  'Mailing address, if different': 'Dirección postal, si es diferente',
  'Current monthly rent or mortgage': 'Renta o hipoteca mensual actual',
  'Separately paid property tax and home insurance per month':
    'Impuesto sobre la propiedad y seguro de vivienda pagados por separado al mes',
  'Phone cost paid separately': 'Teléfono pagado por separado',
  'Trash cost paid separately': 'Recolección de basura pagada por separado',
  'Water cost paid separately': 'Agua pagada por separado',
  'Electric / gas cost paid separately': 'Electricidad o gas pagados por separado',
  'Other heating or cooling cost paid separately':
    'Otros gastos de calefacción o refrigeración pagados por separado',
  'Are you homeless?': '¿No tienes vivienda permanente?',
  'Do you pay shelter costs?': '¿Pagas gastos de alojamiento?',
  'Is an applicant attending college or vocational school?':
    '¿Algún solicitante asiste a la universidad o a una escuela de formación profesional?',
  'School or training': 'Escuela o capacitación',
  Enrollment: 'Inscripción',
  'Number of units (if selected)': 'Número de unidades (si elegiste esta opción)',
  'Working?': '¿Trabaja?',
  'Average work hours per week': 'Horas promedio de trabajo por semana',
  'Does your household get income from a job?': '¿Tu hogar recibe ingresos de un empleo?',
  'Person receiving income': 'Persona que recibe los ingresos',
  Employer: 'Empleador',
  'Self-employed': 'Trabajo por cuenta propia',
  'How often paid': 'Frecuencia de pago',
  'Monthly gross income': 'Ingresos brutos mensuales',
  'Hours worked per month': 'Horas trabajadas al mes',
  'Will income continue?': '¿Continuarán los ingresos?',
  'Do you expect a job or income change?': '¿Esperas un cambio de empleo o ingresos?',
  'Expected change': 'Cambio previsto',
  'Does your household get income outside a job?':
    '¿Tu hogar recibe ingresos que no provienen de un empleo?',
  'Source of income': 'Fuente de ingresos',
  'One-time or ongoing payment': 'Pago único o continuo',
  'How much / how often': 'Cantidad y frecuencia',
  'Do you expect a change to this income?': '¿Esperas un cambio en estos ingresos?',
  'Explain the expected change': 'Explica el cambio previsto',
  'New or increased medical costs for a member who is 60 or older, or disabled?':
    '¿Hay gastos médicos nuevos o mayores para una persona de 60 años o más, o con discapacidad?',
  'Who had the cost?': '¿Quién tuvo el gasto?',
  'Type of cost': 'Tipo de gasto',
  'Amount paid': 'Cantidad pagada',
  'How often?': '¿Con qué frecuencia?',
  'Does a household member pay child support?': '¿Una persona del hogar paga manutención de hijos?',
  'Children’s names': 'Nombres de los hijos',
  'Current amount required': 'Cantidad requerida actualmente',
  'Who paid support?': '¿Quién pagó la manutención?',
  'Does your household pay dependent or child care costs?':
    '¿Tu hogar paga cuidado de dependientes o niños?',
  'Out-of-pocket amount': 'Cantidad pagada de tu bolsillo',
  'Who paid?': '¿Quién pagó?',
  'Dependents / children': 'Dependientes o hijos',
  'Are you interested in applying for Medi-Cal?': '¿Te interesa solicitar Medi-Cal?',
  'Duplicate benefits': 'Beneficios duplicados',
  'If yes, who?': 'Si respondiste sí, ¿quién?',
  'Trafficking of benefits': 'Tráfico de beneficios',
  'Trading benefits for drugs': 'Intercambio de beneficios por drogas',
  'Trading benefits for firearms or explosives':
    'Intercambio de beneficios por armas de fuego o explosivos',
  'Fleeing felon': 'Persona que huye de la justicia por un delito grave',
  'Probation / parole violation': 'Incumplimiento de libertad condicional o supervisada',
  'Additional information / extra table rows': 'Información adicional o filas adicionales',
  'Contact email or phone beside the signature': 'Correo o teléfono junto a la firma',
  'I compared my draft with every page of the official form':
    'Comparé mi borrador con todas las páginas del formulario oficial',
  'I understand I must read the certification, sign and date the official form':
    'Entiendo que debo leer la certificación, firmar y fechar el formulario oficial',
  'Report month': 'Mes del informe',
  'Submit month': 'Mes de entrega',
  'Household name': 'Nombre del hogar',
  'Street address on report cover': 'Dirección en la portada del informe',
  'City / town on report cover': 'Ciudad en la portada del informe',
  'ZIP code on report cover': 'Código postal en la portada del informe',
  'Date on report cover': 'Fecha en la portada del informe',
  Optional: 'Opcional',
  'Is anyone in your household disabled?': '¿Alguna persona del hogar tiene una discapacidad?',
  'Person with a disability': 'Persona con discapacidad',
  Explain: 'Explica',
  'Does anyone need help due to a disability?': '¿Alguien necesita ayuda por una discapacidad?',
  'Person needing assistance': 'Persona que necesita ayuda',
  'Assistance needed': 'Ayuda necesaria',
  'Home street address': 'Dirección de vivienda',
  'Home apartment number': 'Número de apartamento',
  'Home city, state and ZIP code': 'Ciudad, estado y código postal de vivienda',
  'I am homeless': 'No tengo vivienda permanente',
  'Mailing street address / PO box, if different':
    'Dirección postal o apartado postal, si es diferente',
  'Mailing apartment number': 'Número de apartamento postal',
  'Mailing city, state and ZIP code': 'Ciudad, estado y código postal para correo',
  'Keep my current mailing address': 'Mantener mi dirección postal actual',
  'If homeless': 'Si no tienes vivienda permanente',
  'Where should mail go?': '¿Dónde debe llegar el correo?',
  'General Delivery post office ZIP code': 'Código postal de la oficina con entrega general',
  'Other phone': 'Otro teléfono',
  'Receive county text messages about benefits?':
    '¿Recibir mensajes de texto del condado sobre beneficios?',
  'I do not have an email address': 'No tengo correo electrónico',
  'Receive county email notices about benefits?':
    '¿Recibir avisos del condado por correo electrónico?',
  'Has anyone moved in or out, or did you move in with someone?':
    '¿Alguien se mudó al hogar o salió de él, o te mudaste a vivir con otra persona?',
  'Date of birth (MM/DD/YYYY)': 'Fecha de nacimiento (MM/DD/YYYY)',
  'Relationship to head of household': 'Parentesco con la persona principal del hogar',
  'Moved in': 'Se mudó al hogar',
  Birth: 'Nacimiento',
  'Moved out': 'Salió del hogar',
  Death: 'Fallecimiento',
  'Temporary absence': 'Ausencia temporal',
  'Other change': 'Otro cambio',
  'Other change type': 'Tipo de otro cambio',
  'Date of change (MM/DD/YYYY)': 'Fecha del cambio (MM/DD/YYYY)',
  'Buy and make food together?': '¿Compran y preparan alimentos juntos?',
  'Any earned / unearned income in the report month or expected change in the next six months?':
    '¿Hubo ingresos de trabajo o de otras fuentes en el mes del informe, o esperas cambios en los próximos seis meses?',
  'Did total household unearned income increase in the report month?':
    '¿Aumentaron los ingresos totales del hogar que no provienen del trabajo durante el mes del informe?',
  'Household member name': 'Nombre de la persona del hogar',
  'Received in report month': 'Recibido en el mes del informe',
  Started: 'Comenzó',
  Stopped: 'Terminó',
  Changed: 'Cambió',
  'Explain change': 'Explica el cambio',
  'From a job?': '¿Proviene de un empleo?',
  'Type of income outside a job': 'Tipo de ingresos que no provienen de un empleo',
  'Total gross income in report month': 'Ingresos brutos totales del mes del informe',
  'Dates received': 'Fechas de recepción',
  'Proof for the income changes': 'Comprobantes de cambios de ingresos',
  'Did anyone stop working because of a strike?': '¿Alguien dejó de trabajar por una huelga?',
  'Person on strike': 'Persona en huelga',
  'Gross income before strike': 'Ingresos brutos antes de la huelga',
  'If this section applies': 'Si esta sección corresponde',
  'Any changed or new resources?': '¿Hay recursos nuevos o que cambiaron?',
  'Type of resource': 'Tipo de recurso',
  Bought: 'Compró',
  Sold: 'Vendió',
  'Gave away': 'Regaló',
  'Got as a gift': 'Recibió como regalo',
  Traded: 'Intercambió',
  Won: 'Ganó',
  'Opened / closed': 'Abrió o cerró',
  Other: 'Otro',
  'Explain other': 'Explica otro',
  Value: 'Valor',
  'Dates received (MM/DD/YYYY)': 'Fechas de recepción (MM/DD/YYYY)',
  'Proof for resource changes': 'Comprobantes de cambios de recursos',
  'Have your expenses changed?': '¿Cambiaron tus gastos?',
  'Monthly rent or mortgage': 'Renta o hipoteca mensual',
  'Without a permanent address': 'Sin domicilio permanente',
  'Do you pay temporary housing costs?': '¿Pagas alojamiento temporal?',
  'Cost paid': 'Gasto pagado',
  'Phone (including cell)': 'Teléfono (incluido celular)',
  'Electric / gas': 'Electricidad o gas',
  'Property tax': 'Impuesto sobre la propiedad',
  Water: 'Agua',
  'Home / renter’s insurance': 'Seguro de vivienda o de inquilino',
  Trash: 'Recolección de basura',
  'HOA fees': 'Cuotas de asociación de propietarios',
  'Mobile home lot rent': 'Renta del terreno de casa móvil',
  'Other cost': 'Otro gasto',
  'Property tax amount': 'Cantidad de impuesto sobre la propiedad',
  'Home / renter’s insurance amount': 'Cantidad de seguro de vivienda o de inquilino',
  'HOA fee amount': 'Cantidad de cuotas de asociación de propietarios',
  'Other housing cost': 'Otro gasto de vivienda',
  'Specify and amount': 'Especifica el concepto y la cantidad',
  'Who paid dependent / child care?': '¿Quién pagó cuidado de dependientes o niños?',
  'Care paid in report month': 'Cuidado pagado en el mes del informe',
  'Names of dependents / children': 'Nombres de dependientes o hijos',
  'Who paid child support to someone outside household?':
    '¿Quién pagó manutención de hijos a una persona fuera del hogar?',
  'Child support paid in report month': 'Manutención de hijos pagada en el mes del informe',
  'Proof for child support': 'Comprobantes de manutención de hijos',
  'Who paid medical costs?': '¿Quién pagó gastos médicos?',
  'Medical costs paid in report month': 'Gastos médicos pagados en el mes del informe',
  'Proof for medical costs': 'Comprobantes de gastos médicos',
  'Did anyone win money from gambling / lottery in the last six months?':
    '¿Alguien ganó dinero de juegos de azar o lotería en los últimos seis meses?',
  'Winner’s full name': 'Nombre completo de quien ganó',
  'Date of winning (MM/DD/YYYY)': 'Fecha de la ganancia (MM/DD/YYYY)',
  'Amount won': 'Cantidad ganada',
  'Proof for changes above': 'Comprobantes de los cambios anteriores',
  'Optional work question': 'Pregunta opcional sobre trabajo',
  'Health issue prevents work': 'Un problema de salud impide trabajar',
  'Person’s name': 'Nombre de la persona',
  'Caring for child under 6': 'Cuida a un niño menor de 6 años',
  'Caring for a person with disability': 'Cuida a una persona con discapacidad',
  Pregnant: 'Embarazada',
  'School / training at least half-time': 'Escuela o capacitación al menos medio tiempo',
  'Unemployment benefits received / applied': 'Recibe o solicitó beneficios de desempleo',
  'Drug / alcohol treatment or problem': 'Tratamiento o problema de drogas o alcohol',
  'ORR training at least half-time': 'Capacitación de ORR al menos medio tiempo',
  'Child under 18 lives in household': 'Un menor de 18 años vive en el hogar',
  'Experiencing homelessness': 'Sin vivienda permanente',
  Veteran: 'Veterano',
  'Age 24 or younger, in foster care at 18':
    'Tiene 24 años o menos y estaba en cuidado de crianza a los 18',
  'Proof for optional work questions': 'Comprobantes para las preguntas opcionales sobre trabajo',
  'Cash aid only': 'Solo ayuda monetaria',
  'Outstanding felony warrant / parole or probation violation?':
    '¿Orden pendiente por delito grave o incumplimiento de libertad condicional o supervisada?',
  'Outstanding warrant': 'Orden judicial pendiente',
  'Parole / probation violation': 'Incumplimiento de libertad condicional o supervisada',
  'Date, if known': 'Fecha, si se conoce',
  'No changes': 'Sin cambios',
  'Family changes': 'Cambios familiares',
  'Immigration changes': 'Cambios migratorios',
  'Custody changes': 'Cambios de custodia',
  'IHSS changes': 'Cambios de IHSS',
  'School / college attendance changes': 'Cambios de asistencia escolar o universitaria',
  'Other changes': 'Otros cambios',
  'Explain other change': 'Explica otro cambio',
  'Explain changes': 'Explica los cambios',
  'Proof for changes': 'Comprobantes de los cambios',
  'I checked every applicable question on the actual form':
    'Verifiqué cada pregunta que corresponde en el formulario real',
  'I understand I must sign and date the actual form':
    'Entiendo que debo firmar y fechar el formulario real',
  'What is requested?': '¿Qué se solicita?',
  'Relevant people, dates or reporting period': 'Personas, fechas o período de informe pertinentes',
  'Questions to ask the agency': 'Preguntas para la agencia',
  'Answers or information to transfer into the actual form':
    'Respuestas o información para transferir al formulario real',
  'Evidence available and anything still missing': 'Comprobantes disponibles y lo que aún falta',
  'Submission plan': 'Plan de entrega',
  'I checked the prepared item against the original request':
    'Comparé el documento preparado con la solicitud original',
  Yes: 'Sí',
  No: 'No',
  'I need help with this question': 'Necesito ayuda con esta pregunta',
  'Half-time or more': 'Medio tiempo o más',
  'Less than half-time': 'Menos de medio tiempo',
  'Specify number of units': 'Especificar el número de unidades',
  Weekly: 'Cada semana',
  Biweekly: 'Cada dos semanas',
  Monthly: 'Cada mes',
  'Twice monthly': 'Dos veces al mes',
  'Every 2 weeks': 'Cada dos semanas',
  'Twice a month': 'Dos veces al mes',
  'I have attached proof': 'Adjunté comprobantes',
  'I do not have proof / need help getting proof':
    'No tengo comprobantes o necesito ayuda para obtenerlos',
  'I entered my mailing address above': 'Ingresé mi dirección postal arriba',
  'Use the county mailing address (contact county to set up)':
    'Usar la dirección postal del condado (contactar al condado para coordinar)',
  'General Delivery (contact post office to set up)':
    'Entrega general (contactar a la oficina postal para coordinar)',
};

function translate(text: string): string {
  if (WORDING[text]) return WORDING[text];
  if (text.includes(' · ')) return text.split(' · ').map(translate).join(' · ');
  const row = /^(Person|Student|Income|Job|Resource) (\d+)$/.exec(text);
  if (row)
    return `${({ Person: 'Persona', Student: 'Estudiante', Income: 'Ingreso', Job: 'Empleo', Resource: 'Recurso' } as Record<string, string>)[row[1]]} ${row[2]}`;
  const line = /^(.*), line (\d+)$/.exec(text);
  if (line) return `${translate(line[1])}, línea ${line[2]}`;
  return text;
}

/** Translate presentation text only; answers and official identifiers stay exact. */
export function localizeFormAssistance(
  assistance: FormAssistance,
  language: 'en' | 'es',
): FormAssistance {
  const copy = structuredClone(assistance);
  if (language !== 'es') return copy;
  copy.rationale = `${translate(copy.rationale)} Esta guía de Anchor está en español; el PDF oficial mostrado conserva su idioma original. Consulta al condado si necesitas el formulario oficial en español o asistencia de interpretación.`;
  for (const section of copy.sections) {
    section.title = translate(section.title);
    section.description = translate(section.description);
    for (const field of section.fields) {
      field.label = translate(field.label);
      if (field.help) field.help = translate(field.help);
      for (const choice of field.choices ?? []) choice.label = translate(choice.label);
    }
  }
  for (const item of copy.checklist) {
    item.title = translate(item.title);
    item.detail = translate(item.detail);
  }
  return copy;
}
