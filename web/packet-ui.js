// Explicit selection prevents a useful appointment handoff from accidentally
// exporting every document in an account. Generated packets stay on the device.
export function createPacketUI(options) {
  const { t, escape: e, modal, showModal, modalHead, workspace, toast } = options;
  let generation = 0;
  function open() {
    const notices = workspace().notices;
    const files = options.documents().filter((doc) => doc.attachmentId);
    showModal(
      modalHead(t('Prepare for your appointment', 'Prepárate para tu cita')) +
        `<div class="modal-body"><p class="body-text">${t('Choose what to include. Preview your choices before downloading this personal packet. Completed official forms remain separate editable downloads.', 'Elige qué incluir. Revisa tus selecciones antes de descargar este paquete personal. Los formularios oficiales completos conservan sus descargas editables por separado.')}</p><form id="appointment-packet-form"><fieldset class="packet-choices"><legend>${t('Notice summaries', 'Resúmenes de avisos')}</legend>${notices.map((notice) => `<label class="confirm-label"><input type="checkbox" name="notice" value="${e(notice.id)}"><span>${e(notice.title)} · ${e(notice.filename)}</span></label>`).join('') || `<p>${t('No notices yet.', 'Todavía no hay avisos.')}</p>`}</fieldset><fieldset class="packet-choices"><legend>${t('Supporting files', 'Comprobantes')}</legend>${files.map((doc) => `<label class="confirm-label"><input type="checkbox" name="attachment" value="${e(doc.attachmentId)}"><span>${e(doc.name)}</span></label>`).join('') || `<p class="hint">${t('Add supporting evidence from Check packet first.', 'Primero agrega comprobantes en Revisar paquete.')}</p>`}</fieldset><div class="field"><label for="packet-questions">${t('Questions to bring (one per line)', 'Preguntas para llevar (una por línea)')}</label><textarea id="packet-questions" name="questions" maxlength="6000" rows="4"></textarea></div><div class="field"><label for="packet-location">${t('Appointment location (optional)', 'Lugar de la cita (opcional)')}</label><input id="packet-location" name="location" maxlength="200"></div><div class="field"><label for="packet-date">${t('Appointment date (optional)', 'Fecha de la cita (opcional)')}</label><input id="packet-date" type="date" name="date"></div><label class="confirm-label"><input type="checkbox" name="history">${t('Include recorded submission history for selected notices', 'Incluir registros de envío de los avisos seleccionados')}</label><div class="packet-preview" id="packet-selection-preview" role="status"></div><button class="button" type="submit">${t('Download appointment PDF', 'Descargar PDF para la cita')}</button><p id="packet-status" role="status"></p></form></div>`,
    );
    const form = modal.querySelector('#appointment-packet-form');
    const preview = () => {
      const data = new FormData(form);
      modal.querySelector('#packet-selection-preview').textContent = t(
        `${data.getAll('notice').length} notice summaries · ${data.getAll('attachment').length} supporting files selected.`,
        `${data.getAll('notice').length} resúmenes · ${data.getAll('attachment').length} comprobantes seleccionados.`,
      );
    };
    form.addEventListener('change', preview);
    preview();
    const owner = options.owner(),
      token = generation;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'),
        status = form.querySelector('#packet-status');
      button.disabled = true;
      try {
        const data = new FormData(form);
        if (
          !data.getAll('notice').length &&
          !String(data.get('questions')).trim() &&
          !data.getAll('attachment').length
        )
          throw new Error(
            t(
              'Select a notice or file, or add a question.',
              'Selecciona un aviso o archivo, o agrega una pregunta.',
            ),
          );
        const packet = await import('./appointment-packet.js');
        const snapshot = structuredClone(workspace());
        const input = packet.createAppointmentPacketInput(snapshot, {
          language: options.language(),
          createdAt: new Date().toISOString(),
          noticeIds: data.getAll('notice'),
          selectedAttachmentIds: data.getAll('attachment'),
          questions: String(data.get('questions'))
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          includeSubmissionHistory: data.has('history'),
          appointment: {
            date: String(data.get('date') || ''),
            location: String(data.get('location') || ''),
          },
        });
        const attachments = [];
        for (const id of input.selectedAttachmentIds) {
          if (token !== generation || owner !== options.owner()) return;
          const record = await options.readFile(id);
          if (!record?.blob)
            throw new Error(
              t(
                'A selected file is unavailable. Download it separately or remove it from this packet.',
                'Un archivo seleccionado no está disponible. Descárgalo por separado o quítalo del paquete.',
              ),
            );
          let mimeType = record.type || record.blob.type;
          if (/\.txt$/i.test(record.name)) mimeType = 'text/plain';
          if (!['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(mimeType))
            throw new Error(
              t(
                'Use PDF, PNG, JPEG or text files in the packet. Other originals can be downloaded separately.',
                'Usa archivos PDF, PNG, JPEG o texto en el paquete. Descarga otros originales por separado.',
              ),
            );
          attachments.push({
            id,
            name: record.name,
            mimeType,
            bytes: new Uint8Array(await record.blob.arrayBuffer()),
          });
        }
        const bytes = await packet.buildAppointmentPacket(input, attachments);
        if (token !== generation || owner !== options.owner()) return;
        options.download(
          'anchor-appointment-packet.pdf',
          new Blob([bytes], { type: 'application/pdf' }),
          'application/pdf',
        );
        status.textContent = t(
          'Packet downloaded. Review it before sharing; this does not submit anything.',
          'Paquete descargado. Revísalo antes de compartir; no se ha enviado nada.',
        );
      } catch (error) {
        if (token === generation && owner === options.owner()) {
          status.textContent = error.message;
          toast(error.message);
        }
      } finally {
        button.disabled = false;
      }
    });
  }
  return {
    open,
    reset() {
      generation++;
      if (modal.querySelector('#appointment-packet-form')) modal.close();
    },
  };
}
