/** Accessible preparation wizard. Resident-controlled text is escaped once at
 * the HTML boundary; this renderer never reads files or sends draft answers. */
import {
  assessFormDraft,
  visibleFormFields,
  type FormAssistance,
  type FormDraft,
  type FormField,
} from '../domain/form-assistance.js';

export interface FormAssistanceViewOptions {
  assistance: FormAssistance;
  draft: FormDraft;
  activeSection?: number;
  previewPage?: number;
  previewPages?: number;
  previewLabel?: string;
  hasAttachedForm?: boolean;
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

function renderField(field: FormField, draft: FormDraft, canExportPdf: boolean): string {
  const id = `form-field-${field.id}`;
  const value = draft.answers[field.id];
  const mapping = canExportPdf && (field.pdfText || field.pdfChecks);
  const helpId = `${id}-help`;
  const help = [
    field.help,
    mapping
      ? 'Included in the unsigned PDF draft.'
      : 'Preparation notes; transfer into the official form yourself.',
  ]
    .filter(Boolean)
    .join(' ');
  const attributes = `id="${escape(id)}" name="${escape(field.id)}" data-form-field="${escape(field.id)}" aria-describedby="${escape(helpId)}"`;
  if (field.kind === 'checkbox') {
    return `<div class="form-assist-check"><label for="${escape(id)}"><input ${attributes} type="checkbox" ${value === true ? 'checked' : ''}><span>${escape(field.label)}</span></label><p id="${escape(helpId)}">${escape(field.help ?? (mapping ? 'Unchecked unless you choose it. Included in the PDF draft.' : 'This is your preparation record; it does not submit anything.'))}</p></div>`;
  }
  let input: string;
  if (field.kind === 'choice') {
    input = `<select ${attributes}><option value="">Choose an answer…</option>${field.choices?.map((choice) => `<option value="${escape(choice.value)}" ${choice.value === value ? 'selected' : ''}>${escape(choice.label)}</option>`).join('') ?? ''}</select>`;
  } else if (field.kind === 'textarea') {
    input = `<textarea ${attributes} rows="3" maxlength="${field.maxLength ?? 2000}">${escape(value)}</textarea>`;
  } else {
    input = `<input ${attributes} type="text" ${field.kind === 'money' ? 'inputmode="decimal" placeholder="0.00" pattern="(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,2})?" title="Use a nonnegative amount, such as 1200 or 1200.50, without a dollar sign or commas."' : ''} maxlength="${field.maxLength ?? 120}" value="${escape(typeof value === 'string' ? value : '')}" autocomplete="off">`;
  }
  return `<div class="field form-assist-field ${field.kind === 'textarea' ? 'form-assist-wide' : ''}"><label for="${escape(id)}">${escape(field.label)}</label>${input}<p class="hint" id="${escape(helpId)}">${escape(help)}</p></div>`;
}

export function renderFormAssistance({
  assistance,
  draft,
  activeSection = 0,
  previewPage,
  previewPages,
  previewLabel,
  hasAttachedForm = false,
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
  return `<div class="modal-body form-assistance" data-notice="${escape(assistance.noticeId)}" data-request="${escape(assistance.requestId ?? '')}">
    <div class="form-assist-intro">
      <div><span class="form-assist-badge">${escape(t('Guided preparation', 'Preparación guiada'))}</span><h3>${escape(assistance.title)}</h3><p>${escape(assistance.rationale)}</p></div>
      <span class="form-assist-draft-status">${escape(t('Unsigned draft', 'Borrador sin firmar'))}</span>
    </div>
    <p class="form-assist-privacy">${escape(t('Answers are processed on this device and never sent to the AI assistant. Save draft keeps them with your workspace; an account saves privately when connected.', 'Las respuestas se procesan aquí y no se envían al asistente de IA. Guardar borrador las conserva en tu espacio; tu cuenta las guarda de forma privada con conexión.'))}</p>
    ${lang === 'es' ? '<p class="form-assist-language">Los formularios oficiales y esta guía de campos están en inglés. Solicita al condado una versión traducida o un intérprete.</p>' : ''}
    <div class="form-assist-layout">
      <nav class="form-assist-sections" aria-label="${escape(t('Form preparation steps', 'Pasos de preparación'))}">
        ${assistance.sections.map((item, itemIndex) => `<button type="button" data-action="form-section" data-section="${itemIndex}" ${itemIndex === index ? 'aria-current="step"' : ''}><span>${itemIndex + 1}</span><span>${escape(item.title)}</span></button>`).join('')}
        <div class="form-assist-progress" role="status">${progress.answered} ${escape(t('answers drafted', 'respuestas en borrador'))}${progress.needsHelp ? `<br>${progress.needsHelp} ${escape(t('questions saved for help', 'preguntas para pedir ayuda'))}` : ''}</div>
      </nav>
      <section class="form-assist-current" aria-labelledby="form-assist-section-title">
        <div class="form-assist-section-head"><div><p class="form-assist-eyebrow">${escape(t('Step', 'Paso'))} ${index + 1} ${escape(t('of', 'de'))} ${assistance.sections.length}</p><h3 id="form-assist-section-title">${escape(section.title)}</h3></div>${source ? `<button class="link-button" type="button" data-action="form-preview" data-page="${section.page}">${escape(t('View form page', 'Ver página'))} ${section.page}</button>` : ''}</div>
        <p class="form-assist-description">${escape(section.description)}</p>
        <form id="form-assistance-draft" data-section="${index}" autocomplete="off">
          <div class="form-assist-fields">${visibleFormFields(section, draft)
            .map((field) =>
              renderField(field, draft, Boolean(source?.fillable && !hasAttachedForm)),
            )
            .join('')}</div>
          <div class="form-assist-save-row"><button class="button light small" type="submit">${escape(t('Save draft', 'Guardar borrador'))}</button><span id="form-assist-save-status" class="hint" role="status">${escape(t('Saving a draft does not mark this task complete.', 'Guardar un borrador no completa esta tarea.'))}</span></div>
        </form>
        <div class="form-assist-step-buttons">${index > 0 ? `<button class="button light small" type="button" data-action="form-section" data-section="${index - 1}">${escape(t('Previous step', 'Paso anterior'))}</button>` : '<span></span>'}${index < assistance.sections.length - 1 ? `<button class="button small" type="button" data-action="form-section" data-section="${index + 1}">${escape(t('Save & continue', 'Guardar y continuar'))} →</button>` : `<button class="button small" type="button" data-action="form-export-notes">${escape(t('Download preparation notes', 'Descargar notas'))}</button>`}</div>
      </section>
      <aside class="form-assist-document" aria-label="${escape(t('Original form viewer', 'Visor del formulario'))}">
        ${preview ? `<div class="form-assist-viewer-head"><strong>${escape(hasAttachedForm ? t('Your attached form', 'Tu formulario adjunto') : t('Official form', 'Formulario oficial'))}</strong><span>${escape(t('Page', 'Página'))} ${page}${pages ? ` / ${pages}` : ''}</span></div><div class="form-assist-viewer" id="form-assist-viewer"><p id="form-preview-status" role="status">${escape(t('Loading this page on your device…', 'Cargando esta página en tu dispositivo…'))}</p><canvas id="form-preview-canvas" aria-label="${escape(`${previewLabel ?? (hasAttachedForm ? 'Attached form' : source?.title) ?? 'Attached form'}, page ${page}`)}"></canvas></div><div class="form-assist-page-buttons"><button type="button" class="link-button" data-action="form-preview" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← ${escape(t('Previous page', 'Anterior'))}</button><button type="button" class="link-button" data-action="form-preview" data-page="${page + 1}" ${pages && page >= pages ? 'disabled' : ''}>${escape(t('Next page', 'Siguiente'))} →</button></div>` : `<div class="form-assist-empty-preview"><span aria-hidden="true">▤</span><strong>${escape(t('Read your actual form here', 'Lee aquí tu formulario'))}</strong><p>${escape(t('Choose the PDF your agency supplied. Anchor will display it locally alongside your preparation notes.', 'Elige el PDF de tu agencia. Anchor lo mostrará localmente junto a tus notas.'))}</p></div>`}
        ${source ? `<p class="form-assist-source">${escape(source.agency)}<br>${escape(t('Revision', 'Revisión'))} ${escape(source.revision)} · ${escape(t('source checked', 'fuente revisada'))} ${source.reviewedAt}</p><div class="form-assist-source-links"><a href="${escape(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(t('Check CDSS source', 'Ver fuente CDSS'))} ↗</a><a href="${escape(source.localPath)}" download>${escape(t('Download blank PDF', 'Descargar PDF en blanco'))}</a>${source.instructionsPath ? `<a href="${escape(source.instructionsPath)}" target="_blank" rel="noopener noreferrer">${escape(t('Official instructions', 'Instrucciones oficiales'))}</a>` : ''}</div>` : ''}
        <label class="form-assist-attach" for="form-source-file">${escape(source ? t('Use the form your county supplied instead', 'Usar el formulario de tu condado') : t('Choose your actual form PDF', 'Elegir tu formulario PDF'))}<input id="form-source-file" type="file" accept="application/pdf,.pdf"></label>
      </aside>
    </div>
    <details class="form-assist-checklist" ${index === assistance.sections.length - 1 ? 'open' : ''}><summary>${escape(t('Your complete preparation checklist', 'Lista de preparación completa'))}</summary><ol>${assistance.checklist.map((item) => `<li><strong>${escape(item.title)}</strong><p>${escape(item.detail)}</p></li>`).join('')}</ol></details>
    <div class="form-assist-export"><div><strong>${escape(t('Keep a draft you can review.', 'Conserva un borrador para revisar.'))}</strong><p>${escape(source?.fillable && !hasAttachedForm ? t('Mapped answers can be placed into this official PDF. Table notes stay in a separate summary. Signatures stay blank.', 'Las respuestas compatibles se colocan en el PDF oficial. Las tablas quedan en un resumen aparte. Las firmas quedan vacías.') : t('Download your notes, then transfer them into the actual agency form. This guide does not replace it.', 'Descarga las notas y pásalas al formulario oficial. Esta guía no lo reemplaza.'))}</p></div><div class="button-row">${source?.fillable && !hasAttachedForm ? `<button type="button" class="button small" data-action="form-export-pdf">${escape(t('Download unsigned PDF draft', 'Descargar borrador PDF'))}</button>` : ''}<button type="button" class="button light small" data-action="form-export-notes">${escape(t('Download notes', 'Descargar notas'))}</button></div></div>
    ${assistance.officialPortal ? `<p class="form-assist-portal"><a href="${escape(assistance.officialPortal)}" target="_blank" rel="noopener noreferrer">${escape(t('Complete and submit through BenefitsCal', 'Completar y enviar por BenefitsCal'))} ↗</a><span>${escape(t('Official submission happens with your county; Anchor keeps your preparation and records.', 'El envío oficial se realiza con el condado; Anchor conserva tu preparación y registros.'))}</span></p>` : ''}
  </div>`;
}
