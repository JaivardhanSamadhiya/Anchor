// The controller owns presentation only. Local inference and readiness rules
// live in typed domain modules; existing account transport owns persistence.
import {
  inspectDocumentText,
  loadDocumentModel,
  DOCUMENT_KIND_LABELS,
  documentKindLabel,
} from './document-intelligence.js';
import { evaluateEvidenceReadiness } from './evidence-readiness.js';
import { extractFile } from './platform.js';

let modelPromise;
export async function documentModel() {
  modelPromise ||= fetch(new URL('./models/document-classifier.v1.json', import.meta.url))
    .then(async (response) => {
      if (!response.ok)
        throw new Error('The local document model is unavailable. Reconnect and try again.');
      return loadDocumentModel(await response.json());
    })
    .catch((error) => {
      modelPromise = null;
      throw error;
    });
  return modelPromise;
}

export function createReadinessUI(options) {
  const {
    t,
    escape: e,
    workspace,
    noticeById,
    modal,
    showModal,
    modalHead,
    persist,
    render,
    toast,
  } = options;
  let generation = 0;
  const documents = () =>
    workspace().notices.flatMap((notice) =>
      (notice.evidenceDocuments || []).map((doc) => ({ ...doc, noticeId: notice.id })),
    );
  const assessment = () =>
    evaluateEvidenceReadiness({
      notices: workspace().notices,
      documents: documents(),
      formDrafts: workspace().notices.flatMap((notice) =>
        (notice.formDrafts || []).map((record) => record.draft),
      ),
      language: options.language(),
    });
  const label = (kind) => documentKindLabel(kind || 'unknown', options.language());
  function view() {
    const result = assessment();
    const findings = result.findings || [];
    return `<div class="page-head readiness-page-head"><div><div class="eyebrow">${t('BEFORE YOU SEND', 'ANTES DE ENVIAR')}</div><h1>${t('A second look.<br>A clearer packet.', 'Una revisión más.<br>Un paquete más claro.')}</h1><p class="page-sub">${t('Compare the requested period, your supporting files, and your form. Check every suggestion against the originals.', 'Compara el período solicitado, tus comprobantes y el formulario. Verifica cada sugerencia en los originales.')}</p></div><button class="button" data-action="evidence-add">${t('Add supporting evidence', 'Agregar un comprobante')}</button></div><div class="readiness-layout"><section class="panel readiness-results"><div class="panel-head"><h2>${t('What needs your attention', 'Qué requiere tu atención')}</h2><span class="tag ${findings.length ? 'amber' : 'gray'}">${findings.length} ${t('checks', 'revisiones')}</span></div><div class="panel-body">${findings.length ? findings.map((finding) => `<article class="readiness-finding"><span class="tag amber">${e(t('Review', 'Revisar'))}</span><h3>${e(finding.title || finding.code)}</h3><p>${e(finding.detail || finding.message || finding.explanation || '')}</p>${finding.source?.quote ? `<blockquote>${e(finding.source?.quote)}</blockquote>` : ''}<div class="button-row">${finding.noticeId ? `<button class="link-button" data-action="review" data-id="${e(finding.noticeId)}">${t('Check the original notice', 'Revisar el aviso original')}</button>` : ''}${finding.documentIds?.[0] ? `<button class="link-button" data-action="evidence-confirm" data-id="${e(finding.documentIds?.[0])}">${t('Check document facts', 'Revisar datos del documento')}</button>` : ''}</div></article>`).join('') : `<p class="body-text">${t('No mismatches found in the facts currently available. Review applicable questions, signatures and required proof yourself before submitting.', 'No se encontraron diferencias en los datos disponibles. Antes de enviar, revisa las preguntas aplicables, firmas y comprobantes requeridos.')}</p>`}<p class="hint gap-top">${t('These are preparation checks. A matching document does not establish county acceptance or benefit eligibility.', 'Estas son revisiones de preparación. Una coincidencia no confirma aceptación del condado ni elegibilidad.')}</p><button class="button light" data-action="packet">${t('Prepare appointment packet', 'Preparar paquete para una cita')}</button></div></section><section class="panel"><div class="panel-head"><h2>${t('Your supporting documents', 'Tus comprobantes')}</h2><span class="tag gray">${documents().length}</span></div><div class="panel-body">${
      documents()
        .map(
          (doc) =>
            `<article class="readiness-document"><h3>${e(doc.name)}</h3><p>${e(noticeById(doc.noticeId)?.title || '')}</p><span class="tag ${doc.confirmation?.checked ? 'green' : 'amber'}">${doc.confirmation?.checked ? t('Facts checked by you', 'Datos verificados por ti') : t('Check suggested facts', 'Verificar datos sugeridos')}</span><p>${e(label(doc.confirmation?.kind || doc.insight?.classification?.kind))}${doc.confirmation?.month ? ` · ${e(doc.confirmation.month)}` : ''}</p><div class="button-row"><button class="link-button" data-action="evidence-confirm" data-id="${e(doc.id)}">${t('Review facts', 'Revisar datos')}</button>${doc.attachmentId ? `<button class="link-button" data-action="attachment" data-attachment="${e(doc.attachmentId)}">${t('Download original', 'Descargar original')}</button>` : ''}<button class="link-button" data-action="evidence-remove" data-id="${e(doc.id)}">${t('Remove from checks', 'Quitar de las revisiones')}</button></div></article>`,
        )
        .join('') ||
      `<p class="body-text">${t('Add a paystub, rent receipt or other requested proof. Anchor reads it on this device and asks you to verify its facts.', 'Agrega un talón de pago, recibo de alquiler u otro comprobante solicitado. Anchor lo lee aquí y te pide verificar los datos.')}</p>`
    }</div></section></div>`;
  }
  function add() {
    if (!workspace().notices.length)
      return toast(t('Add a notice first.', 'Primero agrega un aviso.'));
    showModal(
      modalHead(t('Add supporting evidence', 'Agregar un comprobante')) +
        `<div class="modal-body"><p class="body-text">${t('Choose the notice this document belongs to. It is read locally; your personal account follows the same private save settings as your other files.', 'Elige el aviso correspondiente. Se lee localmente; tu cuenta personal utiliza el mismo guardado privado que tus otros archivos.')}</p><form id="evidence-add-form"><div class="field"><label for="evidence-notice">${t('Related notice', 'Aviso relacionado')}</label><select id="evidence-notice" name="noticeId">${workspace()
          .notices.map((notice) => `<option value="${e(notice.id)}">${e(notice.title)}</option>`)
          .join(
            '',
          )}</select></div><div class="field"><label for="evidence-file">${t('PDF, image or text document', 'Documento PDF, imagen o texto')}</label><input id="evidence-file" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.bmp" required></div><p id="evidence-read-status" role="status"></p><button class="button" type="submit">${t('Read & review', 'Leer y revisar')}</button></form></div>`,
    );
    const owner = options.owner(),
      token = generation;
    modal.querySelector('#evidence-add-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector('button');
      const file = form.querySelector('#evidence-file').files[0];
      const noticeId = form.querySelector('#evidence-notice').value;
      button.disabled = true;
      const status = form.querySelector('#evidence-read-status');
      try {
        const result = await extractFile(
          file,
          (update) => {
            status.textContent = update.message || '';
          },
          { language: options.language() },
        );
        const insight = inspectDocumentText(result.text, await documentModel());
        const sha256 = [
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
        ]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (token !== generation || owner !== options.owner()) return;
        const notice = noticeById(noticeId);
        if (!notice) return;
        const attachmentId = await options.storeFile(file);
        if (token !== generation || owner !== options.owner()) return;
        const doc = {
          id: crypto.randomUUID(),
          name: file.name,
          attachmentId,
          text: result.text,
          sha256,
          insight,
          confirmation: { checked: false },
        };
        notice.evidenceDocuments ||= [];
        notice.evidenceDocuments.push(doc);
        await persist();
        if (token !== generation || owner !== options.owner()) return;
        render();
        confirm(doc.id);
      } catch (error) {
        if (token === generation && owner === options.owner()) status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
  function confirm(id) {
    const doc = documents().find((item) => item.id === id);
    if (!doc) return;
    const confirmed = doc.confirmation || {};
    const suggestedMonth =
      doc.insight?.months?.find((item) => item.role === 'reporting')?.month || '';
    // A pay-period total cannot be compared with a monthly form field. The
    // resident supplies the basis explicitly; Anchor never annualizes a stub.
    const amountFields = `<fieldset class="packet-choices"><legend>${t('Amount comparison (optional)', 'Comparación de importes (opcional)')}</legend><p class="hint">${t('Only a confirmed monthly gross income or monthly rent amount can be compared with your form. Leave blank if the period or meaning is unclear. A single paycheck is not a monthly total.', 'Solo se compara un importe verificado de ingresos brutos mensuales o alquiler mensual. Déjalo vacío si el período o significado no está claro. Un pago individual no es un total mensual.')}</p><div class="field"><label for="evidence-amount">${t('Amount on the original, in dollars', 'Importe del original, en dólares')}</label><input id="evidence-amount" name="amount" type="number" min="0" max="9999999" step="0.01" value="${Number.isSafeInteger(confirmed.amountCents) ? (confirmed.amountCents / 100).toFixed(2) : ''}"></div><div class="field"><label for="evidence-amount-kind">${t('What this amount represents', 'Qué representa este importe')}</label><select id="evidence-amount-kind" name="amountKind"><option value="">${t('Choose if entering an amount', 'Elige si ingresas un importe')}</option>${[
      ['gross-income', t('Gross income', 'Ingresos brutos')],
      ['net-income', t('Net income', 'Ingresos netos')],
      ['rent', t('Rent', 'Alquiler')],
    ]
      .map(
        ([value, title]) =>
          `<option value="${value}" ${confirmed.amountKind === value ? 'selected' : ''}>${title}</option>`,
      )
      .join(
        '',
      )}</select></div><div class="field"><label for="evidence-amount-basis">${t('Period covered by this amount', 'Período que abarca este importe')}</label><select id="evidence-amount-basis" name="amountBasis"><option value="">${t('Choose if entering an amount', 'Elige si ingresas un importe')}</option><option value="monthly" ${confirmed.amountBasis === 'monthly' ? 'selected' : ''}>${t('Whole reporting month', 'Mes completo del informe')}</option><option value="per-payment" ${confirmed.amountBasis === 'per-payment' ? 'selected' : ''}>${t('One payment or pay period', 'Un pago o período de pago')}</option></select></div><p id="evidence-facts-status" role="status"></p></fieldset>`;
    showModal(
      modalHead(t('Check the document facts', 'Verifica los datos del documento'), e(doc.name)) +
        `<div class="modal-body"><p class="body-text">${t('Suggestions are not confirmed facts. Open your original document and check the person, period and kind before saving.', 'Las sugerencias no son datos confirmados. Revisa la persona, período y tipo en el documento original antes de guardar.')}</p><details><summary>${t('Text read from your document', 'Texto leído del documento')}</summary><pre class="evidence-text">${e(doc.text?.slice(0, 15000) || '')}</pre></details><form id="evidence-confirm-form"><div class="field"><label for="evidence-kind">${t('Document kind', 'Tipo de documento')}</label><select id="evidence-kind" name="kind"><option value="unknown">${t('Not sure', 'No estoy seguro')}</option>${Object.keys(
          DOCUMENT_KIND_LABELS,
        )
          .filter((kind) => kind !== 'unknown')
          .map(
            (kind) =>
              `<option value="${e(kind)}" ${(confirmed.kind || doc.insight?.classification?.kind) === kind ? 'selected' : ''}>${e(label(kind))}</option>`,
          )
          .join(
            '',
          )}</select></div><div class="field"><label for="evidence-month">${t('Reporting month, if applicable', 'Mes del informe, si corresponde')}</label><input id="evidence-month" name="month" type="month" value="${e(confirmed.month || suggestedMonth)}"></div><div class="field"><label for="evidence-person">${t('Person this proof belongs to, if requested', 'Persona a quien pertenece, si se solicita')}</label><input id="evidence-person" name="person" maxlength="100" value="${e(confirmed.person || '')}"></div><label class="confirm-label"><input name="checked" type="checkbox" required>${t('I checked these facts against the original.', 'Verifiqué estos datos en el original.')}</label><div class="button-row"><button class="button" type="submit">${t('Save checked facts', 'Guardar datos verificados')}</button><button type="button" class="button light" data-action="attachment" data-attachment="${e(doc.attachmentId)}">${t('Download original', 'Descargar original')}</button></div></form></div>`,
    );
    const owner = options.owner(),
      token = generation;
    modal
      .querySelector('#evidence-confirm-form .confirm-label')
      .insertAdjacentHTML('beforebegin', amountFields);
    modal.querySelector('#evidence-confirm-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (token !== generation || owner !== options.owner()) return;
      const original = noticeById(doc.noticeId)?.evidenceDocuments?.find((item) => item.id === id);
      if (!original) return;
      const data = new FormData(event.currentTarget);
      original.confirmation = {
        kind: data.get('kind'),
        month: data.get('month') || undefined,
        person: data.get('person') || undefined,
        checked: true,
      };
      if (String(data.get('amount')).trim()) {
        if (!data.get('amountKind') || !data.get('amountBasis')) {
          modal.querySelector('#evidence-facts-status').textContent = t(
            'Choose the amount type and period before saving.',
            'Elige el tipo de importe y período antes de guardar.',
          );
          original.confirmation = confirmed;
          return;
        }
        original.confirmation.amountCents = Math.round(Number(data.get('amount')) * 100);
        original.confirmation.amountKind = data.get('amountKind');
        original.confirmation.amountBasis = data.get('amountBasis');
      }
      await persist();
      if (token !== generation || owner !== options.owner()) return;
      modal.close();
      render();
    });
  }
  async function action(button) {
    if (button.dataset.action === 'evidence-add') {
      add();
      return true;
    }
    if (button.dataset.action === 'evidence-confirm') {
      confirm(button.dataset.id);
      return true;
    }
    if (button.dataset.action === 'evidence-remove') {
      for (const notice of workspace().notices)
        notice.evidenceDocuments = (notice.evidenceDocuments || []).filter(
          (doc) => doc.id !== button.dataset.id,
        );
      await persist();
      render();
      return true;
    }
    return false;
  }
  return {
    view,
    action,
    documents,
    assessment,
    reset() {
      generation++;
      if (modal.querySelector('#evidence-add-form, #evidence-confirm-form')) modal.close();
    },
  };
}
