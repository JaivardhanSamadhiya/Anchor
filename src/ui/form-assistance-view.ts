/** Accessible, local form workspace. Resident-controlled text is escaped at
 * the HTML boundary; this renderer never reads files or sends draft answers. */
import {
  assessFormDraft,
  legacyFormNotes,
  visibleFormFields,
  type FormAssistance,
  type FormDraft,
  type FormField,
} from '../domain/form-assistance.js';

export interface FormAssistantMessage {
  question: string;
  answer?: string;
  mode?: string;
  citations?: readonly { title: string; url: string }[];
  message?: string;
}

export interface FormAssistantPanelState {
  contextLabel?: string;
  contextId?: string;
  contextDescription?: string;
  question?: string;
  adultConfirmed?: boolean;
  authenticated?: boolean;
  waiting?: boolean;
  available?: boolean;
  messages?: readonly FormAssistantMessage[];
  publicQuestions?: readonly { id: string; label: string }[];
  lang?: string;
}

export interface FormAssistanceViewOptions {
  assistance: FormAssistance;
  draft: FormDraft;
  activeSection?: number;
  previewPage?: number;
  previewPages?: number;
  previewLabel?: string;
  hasAttachedForm?: boolean;
  /** Trusted HTML produced by renderFormAssistantPanel, never resident text. */
  assistantHtml?: string;
  lang?: string;
}

const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] as string,
  );
const safeCitation = (url: string): boolean => /^https?:\/\//i.test(url);

/** The controller owns context selection and requests. Only public question
 * labels belong in this panel; it must never be populated with draft answers. */
export function renderFormAssistantPanel({
  contextLabel,
  contextId,
  contextDescription,
  question = '',
  adultConfirmed = false,
  authenticated = false,
  waiting = false,
  available = true,
  messages = [],
  publicQuestions = [],
  lang = 'en',
}: FormAssistantPanelState = {}): string {
  const t = (en: string, es: string): string => (lang === 'es' ? es : en);
  return `<aside class="form-assistant-panel" aria-labelledby="form-assistant-title">
    <div class="form-assistant-head"><span class="form-assistant-mark" aria-hidden="true">A</span><div><h3 id="form-assistant-title">${escape(t('Ask Anchor', 'Pregunta a Anchor'))}</h3><p>${escape(t('A little clarity, right here.', 'Un poco de claridad, aquí mismo.'))}</p></div><span class="form-assistant-presence" aria-hidden="true"></span></div>
    <p class="form-assistant-intro">${escape(t('Highlight a question on the form, or use Ask Anchor next to a guided answer.', 'Selecciona una pregunta del formulario o usa Pregunta a Anchor junto a una respuesta guiada.'))}</p>
    <div id="form-assistant-context" class="form-assistant-context" role="status" ${contextId ? `data-context="${escape(contextId)}"` : ''}><span>${escape(t('Question in focus', 'Pregunta seleccionada'))}</span><strong>${escape(contextLabel || t('Choose a form question', 'Elige una pregunta del formulario'))}</strong>${contextDescription ? `<p>${escape(contextDescription)}</p>` : ''}</div>
    <button type="button" class="form-assistant-selection" data-action="form-ask-selection" ${!available ? 'disabled' : ''}>${escape(t('Explain highlighted question', 'Explicar la pregunta seleccionada'))}<span aria-hidden="true">↗</span></button>
    ${publicQuestions.length ? `<label class="form-assistant-context-label" for="form-assistant-context-select">${escape(t('Or choose a question', 'O elige una pregunta'))}</label><select id="form-assistant-context-select" data-action="form-assistant-context"><option value="">${escape(t('Choose a form question…', 'Elige una pregunta…'))}</option>${publicQuestions.map((item) => `<option value="${escape(item.id)}" ${item.id === contextId ? 'selected' : ''}>${escape(item.label)}</option>`).join('')}</select>` : ''}
    <div id="form-assistant-messages" class="form-assistant-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="${escape(t('Anchor explanations', 'Explicaciones de Anchor'))}">${
      messages.length
        ? messages
            .map(
              (item) =>
                `<article class="form-assistant-turn"><p class="form-assistant-user-question">${escape(item.question)}</p><div class="form-assistant-answer"><span class="form-assistant-answer-label">${escape(
                  item.mode === 'gemini'
                    ? t('Anchor AI', 'IA de Anchor')
                    : item.mode === 'postal'
                      ? t('Anchor · ZIP lookup', 'Anchor · Consulta postal')
                      : item.mode === 'device'
                        ? t('Anchor · On-device help', 'Anchor · Ayuda en este dispositivo')
                        : t('Official guide', 'Guía oficial'),
                )}</span>${item.answer ? `<p>${escape(item.answer)}</p>` : ''}${item.message ? `<p class="form-assistant-response-note">${escape(item.message)}</p>` : ''}${
                  item.citations?.filter((citation) => safeCitation(citation.url)).length
                    ? `<ul class="form-assistant-citations">${item.citations
                        .filter((citation) => safeCitation(citation.url))
                        .map(
                          (citation) =>
                            `<li><a href="${escape(citation.url)}" target="_blank" rel="noopener noreferrer">${escape(citation.title)} <span aria-hidden="true">↗</span></a></li>`,
                        )
                        .join('')}</ul>`
                    : ''
                }</div></article>`,
            )
            .join('')
        : `<div class="form-assistant-empty"><span aria-hidden="true">✦</span><p>${escape(t('Understand what the question is asking before you answer.', 'Entiende qué pide la pregunta antes de responder.'))}</p><span>${escape(t('Anchor explains the wording. You choose your answer.', 'Anchor explica el texto. Tú eliges tu respuesta.'))}</span></div>`
    }${waiting ? `<p class="form-assistant-waiting" role="status">${escape(t('Anchor is preparing an explanation…', 'Anchor está preparando una explicación…'))}</p>` : ''}</div>
    <form id="form-assistant-form" class="form-assistant-form">
      <label for="form-assistant-question">${escape(t('What would you like to understand?', '¿Qué te gustaría entender?'))}</label>
      <textarea id="form-assistant-question" name="question" rows="3" maxlength="500" required aria-describedby="form-assistant-privacy" placeholder="${escape(t('Explain this question.', 'Explica esta pregunta.'))}" ${waiting || !available ? 'disabled' : ''}>${escape(question)}</textarea>
      <label class="form-assistant-adult" for="form-assistant-adult"><input id="form-assistant-adult" type="checkbox" ${adultConfirmed ? 'checked' : ''} ${waiting || !available ? 'disabled' : ''}><span>${escape(t('I’m 18 or older and want optional Anchor AI explanations.', 'Tengo 18 años o más y quiero explicaciones opcionales de la IA de Anchor.'))}</span></label>
      <button id="form-assistant-submit" class="button small" type="submit" ${waiting || !available ? 'disabled' : ''}>${escape(waiting ? t('Preparing explanation…', 'Preparando explicación…') : t('Ask Anchor', 'Pregunta a Anchor'))}<span aria-hidden="true">→</span></button>
      <p id="form-assistant-privacy" class="form-assistant-privacy">${escape(t('Your message is checked on this device. A recognized public form topic can be sent for an AI explanation. Anchor asks for clarification when it cannot resolve a question; ZIP lookup sends only a five-digit code to Zippopotam.us; street addresses and form answers stay out of AI requests.', 'Tu mensaje se revisa en este dispositivo. Un tema público reconocido puede enviarse para una explicación de IA. Anchor pide aclaración cuando no puede resolver una pregunta; la consulta postal envía solo cinco dígitos a Zippopotam.us; las calles y respuestas no se envían a la IA.'))}</p>
      <p class="form-assistant-availability">${escape(!available ? t('Question help is available for verified CF 37 and SAR 7 templates. Use your agency’s instructions for this attached or unverified form.', 'La ayuda está disponible para CF 37 y SAR 7 verificados. Sigue las instrucciones de tu agencia para este formulario.') : !authenticated ? t('Sign in to use optional Anchor AI. You can use the official guide now.', 'Inicia sesión para usar la IA opcional de Anchor. Puedes usar la guía oficial ahora.') : t('Review the official wording before choosing an answer.', 'Revisa el texto oficial antes de elegir una respuesta.'))}</p>
    </form>
  </aside>`;
}

function renderField(
  field: FormField,
  draft: FormDraft,
  canExportPdf: boolean,
  lang: string,
): string {
  const t = (en: string, es: string): string => (lang === 'es' ? es : en);
  const id = `form-field-${field.id}`;
  const value = draft.answers[field.id];
  const mapping = canExportPdf && (field.pdfText || field.pdfChecks);
  const helpId = `${id}-help`;
  const help = [
    field.help,
    mapping
      ? t('Appears on your live form.', 'Aparece en tu formulario en vivo.')
      : t(
          'Preparation note; transfer this to the official form yourself.',
          'Nota de preparación; pásala al formulario oficial.',
        ),
  ]
    .filter(Boolean)
    .join(' ');
  const attributes = `id="${escape(id)}" name="${escape(field.id)}" data-form-field="${escape(field.id)}" aria-describedby="${escape(helpId)}"`;
  const ask = canExportPdf
    ? `<button type="button" class="form-assist-ask-field" data-action="form-ask-field" data-field="${escape(field.id)}" aria-label="${escape(`${t('Ask Anchor about', 'Pregunta a Anchor sobre')}: ${field.label}`)}"><span aria-hidden="true">?</span>${escape(t('Ask Anchor', 'Pregunta a Anchor'))}</button>`
    : '';
  if (field.kind === 'checkbox') {
    return `<div class="form-assist-check"><div class="form-assist-field-label"><label for="${escape(id)}"><input ${attributes} type="checkbox" ${value === true ? 'checked' : ''}><span data-form-help-field="${escape(field.id)}">${escape(field.label)}</span></label>${ask}</div><p id="${escape(helpId)}" data-form-help-field="${escape(field.id)}">${escape(help)}</p></div>`;
  }
  let input: string;
  if (field.kind === 'choice') {
    input = `<select ${attributes}><option value="">${escape(t('Choose an answer…', 'Elige una respuesta…'))}</option>${field.choices?.map((choice) => `<option value="${escape(choice.value)}" ${choice.value === value ? 'selected' : ''}>${escape(choice.label)}</option>`).join('') ?? ''}</select>`;
  } else if (field.kind === 'textarea') {
    input = `<textarea ${attributes} rows="3" maxlength="${field.maxLength ?? 2000}">${escape(value)}</textarea>`;
  } else {
    input = `<input ${attributes} type="text" ${field.kind === 'money' ? 'inputmode="decimal" placeholder="0.00" pattern="(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,2})?" title="Use a nonnegative amount, such as 1200 or 1200.50, without a dollar sign or commas."' : ''} maxlength="${field.maxLength ?? 120}" value="${escape(typeof value === 'string' ? value : '')}" autocomplete="off">`;
  }
  return `<div class="field form-assist-field ${field.kind === 'textarea' ? 'form-assist-wide' : ''}"><div class="form-assist-field-label"><label for="${escape(id)}" data-form-help-field="${escape(field.id)}">${escape(field.label)}</label>${ask}</div>${input}<p class="hint" id="${escape(helpId)}" data-form-help-field="${escape(field.id)}">${escape(help)}</p></div>`;
}

export function renderFormAssistance({
  assistance,
  draft,
  activeSection = 0,
  previewPage,
  previewPages,
  previewLabel,
  hasAttachedForm = false,
  assistantHtml,
  lang = 'en',
}: FormAssistanceViewOptions): string {
  const t = (en: string, es: string): string => (lang === 'es' ? es : en);
  const index = Math.max(
    0,
    Math.min(assistance.sections.length - 1, Math.trunc(activeSection) || 0),
  );
  const section = assistance.sections[index];
  const pages = previewPages ?? (hasAttachedForm ? undefined : assistance.form?.pages);
  const page = Math.max(
    1,
    Math.min(pages ?? 100, Math.trunc(previewPage ?? section.page) || section.page),
  );
  const progress = assessFormDraft(assistance, draft);
  const preview = assistance.form || hasAttachedForm;
  const source = assistance.form;
  const canExportPdf = Boolean(source?.fillable && !hasAttachedForm);
  const finalStep = index === assistance.sections.length - 1;
  const earlierNotes = legacyFormNotes(draft);
  const manualAnswers = canExportPdf
    ? assistance.sections
        .flatMap((item) => visibleFormFields(item, draft))
        .filter(
          (field) =>
            !field.pdfText?.length &&
            !field.pdfChecks &&
            (draft.answers[field.id] === true ||
              (typeof draft.answers[field.id] === 'string' &&
                String(draft.answers[field.id]).trim())),
        ).length
    : 0;
  return `<div class="modal-body form-assistance" data-notice="${escape(assistance.noticeId)}" data-request="${escape(assistance.requestId ?? '')}">
    <div class="form-assist-workspace-scroll">
      <div class="form-assist-intro"><div><span class="form-assist-badge">${escape(t('Your form workspace', 'Tu espacio de formularios'))}</span><h3>${escape(assistance.title)}</h3><p>${escape(assistance.rationale)}</p></div><span class="form-assist-draft-status"><span aria-hidden="true">●</span>${escape(t('Unsigned draft', 'Borrador sin firmar'))}</span></div>
      <p class="form-assist-privacy"><span class="form-assist-privacy-mark" aria-hidden="true">✓</span><span>${escape(t('Your answers stay private. Form filling happens on this device; answers are never sent to Anchor AI. Save draft keeps your work in this workspace and privately in your account when connected.', 'Tus respuestas son privadas. El formulario se llena en este dispositivo y las respuestas nunca se envían a la IA de Anchor. Guardar borrador conserva tu trabajo aquí y en tu cuenta privada con conexión.'))}</span></p>
      ${lang === 'es' ? '<p class="form-assist-language">La guía de Anchor está en español; el PDF oficial conserva su idioma original. Solicita al condado una versión oficial traducida o un intérprete si lo necesitas.</p>' : ''}
      ${earlierNotes.length ? `<section class="form-assist-migration" aria-labelledby="form-assist-migration-title"><h4 id="form-assist-migration-title">${escape(t('Your earlier preparation notes are saved', 'Tus notas anteriores están guardadas'))}</h4><p>${escape(t('This guide now has separate fields for these details. Review your saved notes and copy the needed information into the matching fields. Earlier notes have not been placed into the PDF.', 'Esta guía ahora tiene campos separados para estos detalles. Revisa tus notas y copia la información necesaria en los campos correspondientes. Las notas anteriores no se han colocado en el PDF.'))}</p><details><summary>${escape(t('Review saved notes', 'Revisar las notas guardadas'))} (${earlierNotes.length})</summary><dl>${earlierNotes.map((item) => `<dt>${escape(item.label)}</dt><dd>${escape(item.value)}</dd>`).join('')}</dl></details></section>` : ''}
      <nav class="form-assist-sections" aria-label="${escape(t('Form preparation steps', 'Pasos de preparación'))}">${assistance.sections.map((item, itemIndex) => `<button type="button" data-action="form-section" data-section="${itemIndex}" ${itemIndex === index ? 'aria-current="step"' : ''}><span>${itemIndex + 1}</span><span>${escape(item.title)}</span></button>`).join('')}</nav>
      <div class="form-assist-layout">
        <section class="form-assist-current" aria-labelledby="form-assist-section-title">
          <div class="form-assist-section-head"><div><p class="form-assist-eyebrow">${escape(t('Guided answers', 'Respuestas guiadas'))} · ${index + 1} / ${assistance.sections.length}</p><h3 id="form-assist-section-title">${escape(section.title)}</h3></div>${source ? `<button class="link-button" type="button" data-action="form-preview" data-page="${section.page}">${escape(t('Page', 'Página'))} ${section.page} <span aria-hidden="true">↗</span></button>` : ''}</div>
          <p class="form-assist-description">${escape(section.description)}</p>
          <form id="form-assistance-draft" data-section="${index}" autocomplete="off"><div class="form-assist-fields">${visibleFormFields(
            section,
            draft,
          )
            .map((field) => renderField(field, draft, canExportPdf, lang))
            .join(
              '',
            )}</div><div class="form-assist-save-row"><button class="button light small" type="submit">${escape(t('Save draft', 'Guardar borrador'))}</button><span id="form-assist-save-status" class="hint" role="status">${escape(t('Your work stays a draft until you submit it to your county.', 'Tu trabajo sigue siendo un borrador hasta que lo envíes al condado.'))}</span></div></form>
          <div class="form-assist-step-buttons">${index > 0 ? `<button class="button light small" type="button" data-action="form-section" data-section="${index - 1}">← ${escape(t('Previous', 'Anterior'))}</button>` : '<span></span>'}${!finalStep ? `<button class="button small" type="button" data-action="form-section" data-section="${index + 1}">${escape(t('Save & continue', 'Guardar y continuar'))} →</button>` : `<button class="button small" type="button" data-action="${canExportPdf ? 'form-export-pdf' : 'form-export-notes'}">${escape(canExportPdf ? t('Download completed form', 'Descargar formulario completo') : t('Download preparation notes', 'Descargar notas de preparación'))}</button>`}</div>
          <div class="form-assist-progress" role="status"><span>${progress.answered}</span> ${escape(t('answers drafted', 'respuestas en borrador'))}${progress.needsHelp ? ` · ${progress.needsHelp} ${escape(t('questions for help', 'preguntas para pedir ayuda'))}` : ''}</div>
        </section>
        <aside class="form-assist-document" aria-label="${escape(t('Live form viewer', 'Visor del formulario en vivo'))}">
          ${preview ? `<div class="form-assist-viewer-head"><div><strong>${escape(hasAttachedForm ? t('Your attached form', 'Tu formulario adjunto') : canExportPdf ? t('Your live form', 'Tu formulario en vivo') : t('Official form', 'Formulario oficial'))}</strong><span class="form-assist-viewer-caption">${escape(canExportPdf ? t('See your answers appear as you type', 'Ve tus respuestas mientras escribes') : t('Read the original alongside your notes', 'Lee el original junto a tus notas'))}</span></div><span class="form-assist-page-count" data-form-page-label>${escape(t('Page', 'Página'))} ${page}${pages ? ` / ${pages}` : ''}</span></div><div class="form-assist-viewer" id="form-assist-viewer"><p id="form-preview-status" role="status">${escape(t('Loading this page on your device…', 'Cargando esta página en tu dispositivo…'))}</p><div class="form-preview-page" id="form-preview-page"><canvas id="form-preview-canvas" aria-label="${escape(`${previewLabel ?? (hasAttachedForm ? 'Attached form' : source?.title) ?? 'Attached form'}, page ${page}`)}"></canvas><div id="form-preview-text-layer" class="form-preview-text-layer textLayer" aria-label="${escape(t('Selectable form text. Highlight a public question to ask Anchor.', 'Texto seleccionable. Selecciona una pregunta pública para preguntar a Anchor.'))}"></div></div></div><div class="form-assist-page-buttons"><button type="button" class="link-button" data-action="form-preview" data-page="${page - 1}" data-form-page-prev ${page <= 1 ? 'disabled' : ''}>← ${escape(t('Previous page', 'Anterior'))}</button><span>${escape(t('Highlight a question for help', 'Selecciona una pregunta para ayuda'))}</span><button type="button" class="link-button" data-action="form-preview" data-page="${page + 1}" data-form-page-next ${pages && page >= pages ? 'disabled' : ''}>${escape(t('Next page', 'Siguiente'))} →</button></div>` : `<div class="form-assist-empty-preview"><span aria-hidden="true">▤</span><strong>${escape(t('Your actual form belongs here', 'Tu formulario va aquí'))}</strong><p>${escape(t('Choose the PDF your agency supplied. Read it here while you prepare your answers.', 'Elige el PDF de tu agencia. Léelo aquí mientras preparas tus respuestas.'))}</p><span class="form-assist-unmapped">${escape(t('Read & prepare', 'Leer y preparar'))}</span></div>`}
          <details class="form-assist-source-options" ${!source || hasAttachedForm ? 'open' : ''}><summary>${escape(t('Source & form options', 'Fuente y opciones del formulario'))}</summary>${source ? `<p class="form-assist-source">${escape(source.agency)}<br>${escape(t('Revision', 'Revisión'))} ${escape(source.revision)} · ${escape(t('source checked', 'fuente revisada'))} ${escape(source.reviewedAt)}</p><div class="form-assist-source-links"><a href="${escape(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(t('Check CDSS source', 'Ver fuente CDSS'))} ↗</a><a href="${escape(source.localPath)}" download>${escape(t('Download blank PDF', 'Descargar PDF en blanco'))}</a>${source.instructionsPath ? `<a href="${escape(source.instructionsPath)}" target="_blank" rel="noopener noreferrer">${escape(t('Official instructions', 'Instrucciones oficiales'))}</a>` : ''}</div>` : ''}<label class="form-assist-attach" for="form-source-file">${escape(source ? t('Use the form your county supplied', 'Usar el formulario de tu condado') : t('Choose your actual form PDF', 'Elegir tu formulario PDF'))}<input id="form-source-file" type="file" accept="application/pdf,.pdf"></label>${hasAttachedForm ? `<p class="form-assist-unmapped-note">${escape(t('This uploaded form is available for reading. Guided answers remain preparation notes because its fields have not been verified.', 'Este formulario se puede leer. Las respuestas guiadas siguen siendo notas porque sus campos no se han verificado.'))}</p>` : ''}</details>
        </aside>
        ${assistantHtml ?? renderFormAssistantPanel({ lang, available: canExportPdf, publicQuestions: assistance.sections.flatMap((item) => item.fields.map((field) => ({ id: field.id, label: field.label }))) })}
      </div>
      <details class="form-assist-checklist" ${finalStep ? 'open' : ''}><summary>${escape(t('Before you send your form', 'Antes de enviar tu formulario'))}</summary><ol>${assistance.checklist.map((item) => `<li><strong>${escape(item.title)}</strong><p>${escape(item.detail)}</p></li>`).join('')}</ol></details>
      ${assistance.officialPortal ? `<p class="form-assist-portal"><a href="${escape(assistance.officialPortal)}" target="_blank" rel="noopener noreferrer">${escape(t('Complete and submit through BenefitsCal', 'Completar y enviar por BenefitsCal'))} ↗</a><span>${escape(t('Submit your reviewed form to your county. Anchor keeps your draft and records.', 'Envía el formulario revisado al condado. Anchor conserva tu borrador y registros.'))}</span></p>` : ''}
    </div>
    <footer class="form-assist-export"><div>${canExportPdf && (earlierNotes.length || manualAnswers) ? `<p class="form-assist-export-warning">${escape(t('Review your saved preparation notes separately and copy any needed details into the form before sending.', 'Revisa tus notas por separado y copia los detalles necesarios en el formulario antes de enviarlo.'))}</p>` : ''}<strong>${escape(canExportPdf ? t('Ready when you are.', 'Listo cuando tú lo estés.') : t('Keep your preparation with you.', 'Conserva tu preparación.'))}</strong><p>${escape(canExportPdf ? t('Download the official form with your answers. Review every page and add any required signature before submitting. Your download remains an unsigned draft.', 'Descarga el formulario oficial con tus respuestas. Revisa cada página y añade la firma requerida antes de enviarlo. La descarga sigue siendo un borrador sin firmar.') : t('Download your notes and transfer them into the actual agency form. Uploaded and unmapped forms are available for reading and preparation.', 'Descarga las notas y pásalas al formulario de la agencia. Los formularios sin campos verificados permiten lectura y preparación.'))}</p></div><div class="form-assist-export-actions">${canExportPdf ? `<details class="form-assist-extra-notes"><summary>${escape(t('Preparation notes', 'Notas de preparación'))}</summary><button type="button" class="link-button" data-action="form-export-notes">${escape(t('Download notes', 'Descargar notas'))}</button></details><button type="button" class="button form-assist-download" data-action="form-export-pdf"><span aria-hidden="true">↓</span>${escape(t('Download completed form', 'Descargar formulario completo'))}</button>` : `<button type="button" class="button form-assist-download" data-action="form-export-notes"><span aria-hidden="true">↓</span>${escape(t('Download notes', 'Descargar notas'))}</button>`}</div></footer>
  </div>`;
}
