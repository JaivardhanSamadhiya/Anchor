/**
 * Small presentation layer for the continuity domain. Every resident-controlled
 * string is escaped at the HTML boundary; actions use the application's existing
 * delegated event handler. Rendering never changes facts or ledger records.
 */
import {
  assessContinuity,
  type ContinuityWorkspace,
  type WorkflowNode,
  type NoticeLane,
  type Blocker,
  type Stage,
  type EvidenceCandidate,
} from '../domain/continuity.js';

export interface ContinuityViewOptions {
  workspace: ContinuityWorkspace;
  lang?: string;
  today?: string | Date;
  capacityMinutes?: number;
}

const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] as string,
  );

export function renderContinuity({
  workspace,
  lang = 'en',
  today,
  capacityMinutes = 30,
}: ContinuityViewOptions): string {
  const t = (en: string, es: string): string => (lang === 'es' ? es : en);
  const assessment = assessContinuity(workspace, { today, capacityMinutes });
  const unfinished = assessment.nodes.filter((node) => node.state !== 'complete').length;
  const date = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(`${iso}T00:00:00Z`));
    } catch {
      return iso;
    }
  };
  const stageNames: Record<Stage, string> = {
    review: t('Check letter', 'Revisar aviso'),
    prepare: t('Prepare', 'Preparar'),
    submit: t('Submission record', 'Registro de envío'),
    proof: t('Confirmation file', 'Archivo de confirmación'),
    followup: t('Response record', 'Registro de respuesta'),
  };
  const reasonText = (blocker: Blocker): string =>
    ({
      unsupported: t(
        'This notice needs a person’s review.',
        'Este aviso requiere revisión humana.',
      ),
      'review-unchecked': t(
        'Review the letter before using its plan.',
        'Revisa el aviso antes de usar su plan.',
      ),
      'deadline-unverified': t(
        'A date still needs checking against the original.',
        'Falta verificar una fecha en el original.',
      ),
      'deadline-missing': t(
        'No applicable date has been checked yet. Ask the county about timing.',
        'No hay fechas aplicables verificadas. Consulta el plazo con el condado.',
      ),
      'deadline-conflict': t(
        'Different dates within this letter need a recorded clarification.',
        'Las fechas distintas dentro de este aviso requieren una aclaración registrada.',
      ),
      'no-request': t(
        'No definite paperwork request was identified; ask which steps apply.',
        'No se identificó una solicitud clara de documentos; consulta qué pasos corresponden.',
      ),
      'preparation-pending': t(
        'A requested item has not been marked prepared.',
        'Un documento solicitado aún no está marcado como preparado.',
      ),
      'submission-missing': t(
        'No submission has been recorded for this notice.',
        'No se ha registrado un envío para este aviso.',
      ),
      'proof-missing': t(
        'A confirmation file has not been saved.',
        'No se ha guardado un archivo de confirmación.',
      ),
      'acknowledgement-missing': t(
        'No response has been recorded for the latest submission.',
        'No se ha registrado una respuesta para el último envío.',
      ),
    })[blocker.code];

  const sourceButton = (noticeId: string, line?: number, label?: string): string =>
    `<button class="link-button" data-action="${line ? 'source' : 'review'}" data-id="${escape(noticeId)}"${line ? ` data-line="${escape(line)}"` : ''}>${label ?? t('Open original', 'Abrir original')} <span aria-hidden="true">↗</span>
      </button>`;
  const nodeLabel = (node: WorkflowNode): string => {
    if (node.stage === 'prepare') return node.title;
    if (node.stage === 'review')
      return t('Check dates and requests', 'Verificar fechas y solicitudes');
    if (node.stage === 'submit')
      return t('Review the official submission channel', 'Revisar el canal oficial de envío');
    if (node.stage === 'proof')
      return t('Find and save your confirmation', 'Buscar y guardar tu confirmación');
    return t('Prepare a follow-up question', 'Preparar una pregunta de seguimiento');
  };
  const nodeAction = (node: WorkflowNode): string => {
    if (node.stage === 'review' || node.stage === 'prepare')
      return sourceButton(node.noticeId, node.line, t('Open step', 'Abrir paso'));
    if (node.stage === 'submit')
      return `<button class="link-button" data-action="nav" data-page="support">${t('Official channels', 'Canales oficiales')} <span aria-hidden="true">↗</span>
      </button>`;
    if (node.stage === 'proof')
      return `<button class="link-button" data-action="nav" data-page="evidence">${t('Open records', 'Abrir registros')} <span aria-hidden="true">↗</span>
      </button>`;
    return `<button class="link-button" data-action="nav" data-page="support">${t('Get contact details', 'Ver contactos')} <span aria-hidden="true">↗</span>
      </button>`;
  };
  const sessionItem = (node: WorkflowNode, index: number): string => {
    const notice = workspace.notices.find((item) => item.id === node.noticeId);
    return `<li class="continuity-focus">
      <span class="continuity-focus-number" aria-hidden="true">${index + 1}</span>
      <div>
      <h3>${escape(nodeLabel(node))}</h3>
      <p>${escape(notice?.title)}${node.due ? ` · ${t('Checked date', 'Fecha verificada')}: ${escape(date(node.due))}` : ''}</p>${nodeAction(node)}</div>
      <span class="continuity-time">${node.timeboxMinutes} ${t('min focus', 'min de enfoque')}</span>
      </li>`;
  };
  const nodeState = (lane: NoticeLane, stage: Stage): 'complete' | 'ready' | 'blocked' => {
    const nodes = lane.nodes.filter((node) => node.stage === stage);
    return nodes.length && nodes.every((node) => node.state === 'complete')
      ? 'complete'
      : nodes.some((node) => node.state === 'ready')
        ? 'ready'
        : 'blocked';
  };
  const laneMarkup = (lane: NoticeLane, index: number): string => {
    const stages: Stage[] = ['review', 'prepare', 'submit', 'proof', 'followup'];
    const uniqueBlockers = lane.blockers.filter(
      (item, i, list) => list.findIndex((other) => other.code === item.code) === i,
    );
    const pendingPreparation = lane.requested - lane.prepared;
    const additionalReasons =
      !lane.blockers.length && pendingPreparation > 0
        ? [
            t(
              `${pendingPreparation} requested item${pendingPreparation === 1 ? '' : 's'} still need preparation.`,
              `Falta preparar ${pendingPreparation} documento${pendingPreparation === 1 ? '' : 's'} solicitado${pendingPreparation === 1 ? '' : 's'}.`,
            ),
          ]
        : [];
    return `<article class="continuity-lane">
      <div class="continuity-lane-heading">
      <div>
      <span class="continuity-letter">${t('LETTER', 'AVISO')} ${String(index + 1).padStart(2, '0')}</span>
      <h3>${escape(lane.notice.title)}</h3>
      <p>${escape(lane.notice.filename ?? '')}</p>
      </div>${sourceButton(lane.notice.id)}</div>
      <ol class="continuity-stages" aria-label="${escape(t('Recorded progress for ', 'Progreso registrado de ') + lane.notice.title)}">${stages
        .map((stage, i) => {
          const status = nodeState(lane, stage);
          return `<li class="${status}">
      <span class="continuity-stage-dot" aria-hidden="true">${status === 'complete' ? '✓' : i + 1}</span>
      <span>${stageNames[stage]}<small>${status === 'complete' ? t('Recorded by you', 'Registrado por ti') : status === 'ready' ? t('Next step', 'Siguiente paso') : t('Needs earlier step', 'Requiere un paso previo')}</small>
      </span>
      </li>`;
        })
        .join('')}</ol>
      <details class="continuity-details">
      <summary>${t('Why this step is next', 'Por qué sigue este paso')} <span>${lane.prepared}/${lane.requested} ${t('prepared', 'preparados')}</span>
      </summary>
      <div class="continuity-details-body">${uniqueBlockers.length || additionalReasons.length ? `<ul>${uniqueBlockers.map((blocker) => `<li>${reasonText(blocker)}</li>`).join('')}${additionalReasons.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>` : `<p>${t('The original dates and requests were reviewed. Preparation records and submission records are tracked separately.', 'Se revisaron las fechas y solicitudes originales. La preparación y los envíos se registran por separado.')}</p>`}${
        lane.latestSubmission
          ? `<p>
      <strong>${t('Latest submission record', 'Último registro de envío')}:</strong> ${escape(date(String(lane.latestSubmission.date).slice(0, 10)))}. ${t('A resident record does not independently verify delivery.', 'Un registro personal no verifica por sí mismo la entrega.')}</p>`
          : `<p>${t('No submission record yet. Use the official channel, then keep your record here.', 'Todavía no hay un registro de envío. Usa el canal oficial y luego conserva el registro aquí.')}</p>`
      }${
        lane.acknowledgement
          ? `<p>
      <strong>${t('Response recorded by you', 'Respuesta registrada por ti')}:</strong> ${escape(lane.acknowledgement.detail)}</p>`
          : lane.latestSubmission
            ? `<p>${t('No response is recorded for the latest submission. Ask the county if anything remains unclear; Anchor does not assume acceptance.', 'No hay una respuesta registrada para el último envío. Consulta al condado si algo sigue sin aclararse; Anchor no asume aceptación.')}</p>
      <button class="button light small" data-action="continuity-acknowledge" data-id="${escape(lane.notice.id)}" data-submission="${escape(lane.latestSubmission.id)}">${t('Record a response I received', 'Registrar una respuesta recibida')}</button>`
            : ''
      }<p class="continuity-footnote">${t('A saved file and a checkmark do not establish approval, eligibility, or continuing benefits.', 'Un archivo guardado y una marca no establecen aprobación, elegibilidad ni continuidad de beneficios.')}</p>
      </div>
      </details>
      </article>`;
  };
  const reuseMarkup = (candidate: EvidenceCandidate): string => `<article class="continuity-match">
      <div class="continuity-match-icon" aria-hidden="true">↔</div>
      <div>
      <h3>${escape(candidate.targetRequest.title)}</h3>
      <p>${t('Identical request wording appears in two letters. A preparation record exists for', 'Dos avisos contienen el mismo texto de solicitud. Hay un registro de preparación para')} <strong>${escape(candidate.sourceNotice.title)}</strong>.</p>
      <p>${t('Check the person, period, and each submission instruction before reusing anything. Both requests remain separate.', 'Verifica la persona, el período y las instrucciones de cada envío antes de reutilizar documentos. Ambas solicitudes siguen separadas.')}</p>
      <div class="continuity-match-actions">${sourceButton(candidate.sourceNotice.id, candidate.sourceRequest.line, t('First letter', 'Primer aviso'))}${sourceButton(candidate.targetNotice.id, candidate.targetRequest.line, t('Second letter', 'Segundo aviso'))}${candidate.chosen ? `<span class="tag green">${t('Reuse choice recorded', 'Decisión de reutilización registrada')}</span>` : `<button class="button light small" data-action="continuity-reuse" data-id="${escape(candidate.targetNotice.id)}" data-task="${escape(candidate.targetRequest.id)}" data-source-notice="${escape(candidate.sourceNotice.id)}" data-source-task="${escape(candidate.sourceRequest.id)}">${t('Compare for reuse', 'Comparar para reutilizar')}</button>`}</div>
      </div>
      </article>`;

  if (!workspace.notices.length)
    return `<section class="continuity panel continuity-empty">
      <span class="continuity-kicker">${t('CONTINUITY WORKSPACE', 'ESPACIO DE CONTINUIDAD')}</span>
      <h2>${t('See how your next steps connect.', 'Ve cómo se conectan tus próximos pasos.')}</h2>
      <p>${t('Add a notice to connect its dates, preparation, submission records, and follow-up in one place.', 'Agrega un aviso para conectar fechas, preparación, registros de envío y seguimiento en un solo lugar.')}</p>
      <button class="button" data-action="import">${t('Add a notice', 'Agregar un aviso')}</button>
      </section>`;

  return `<section class="continuity" aria-label="${t('Benefit continuity workspace', 'Espacio de continuidad de beneficios')}">
      <div class="continuity-intro">
      <div>
      <span class="continuity-kicker">${t('FROM LETTER TO FOLLOW-THROUGH', 'DEL AVISO AL SEGUIMIENTO')}</span>
      <h2>${t('A plan that sees the whole picture.', 'Un plan que ve el panorama completo.')}</h2>
      <p>${t('Connect your letters, see what is holding up the next step, and choose a manageable focus for today.', 'Conecta tus avisos, identifica qué falta para el siguiente paso y elige un enfoque manejable para hoy.')}</p>
      </div>
      <span class="continuity-method">${t('Facts → dependencies → next steps', 'Hechos → dependencias → próximos pasos')}</span>
      </div>
    <div class="continuity-top">
      <section class="panel continuity-session">
      <div class="continuity-card-heading">
      <div>
      <span class="continuity-kicker">${t('YOUR TIME, YOUR PACE', 'TU TIEMPO, TU RITMO')}</span>
      <h3>${t('What can I focus on today?', '¿En qué puedo enfocarme hoy?')}</h3>
      </div>
      </div>
      <div class="continuity-capacity" role="group" aria-label="${t('Choose time available', 'Elegir tiempo disponible')}">${[15, 30, 60].map((minutes) => `<button data-action="continuity-capacity" data-minutes="${minutes}" aria-pressed="${assessment.capacityMinutes === minutes}">${minutes} ${t('minutes', 'minutos')}</button>`).join('')}</div>
      <p class="continuity-explainer">${t('These are suggested focus blocks, not completion estimates. Only steps whose earlier requirements are recorded appear here.', 'Son bloques de enfoque sugeridos, no estimaciones de finalización. Solo aparecen pasos cuyos requisitos previos están registrados.')}</p>${
        assessment.session.length
          ? `<ol class="continuity-focus-list">${assessment.session.map(sessionItem).join('')}</ol>`
          : `<div class="continuity-no-focus">
      <p>${unfinished === 0 ? t('Your recorded workflow steps are up to date. Keep the originals and ask your county if anything changes.', 'Tus pasos registrados están al día. Conserva los originales y consulta al condado si algo cambia.') : t('The next steps need a human review. Open the letter below or contact a navigator.', 'Los siguientes pasos requieren revisión humana. Abre el aviso abajo o contacta a un asesor.')}</p>
      <button class="link-button" data-action="nav" data-page="support">${t('Find support', 'Buscar ayuda')} ↗</button>
      </div>`
      }<div class="continuity-scenario" aria-label="${t('Read-only scenario comparison', 'Comparación de escenarios sin cambios')}">
      <div>
      <strong>${t('Use this focus block', 'Usar este bloque')}</strong>
      <p>${t(`Start ${assessment.session.length} currently available step${assessment.session.length === 1 ? '' : 's'} across your letters.`, `Iniciar ${assessment.session.length} paso${assessment.session.length === 1 ? '' : 's'} disponible${assessment.session.length === 1 ? '' : 's'} entre tus avisos.`)}</p>
      </div>
      <div>
      <strong>${t('Wait without taking a step', 'Esperar sin dar un paso')}</strong>
      <p>${t(`Your ${unfinished} unfinished step${unfinished === 1 ? '' : 's'} remain in this workspace.`, `Tus ${unfinished} paso${unfinished === 1 ? '' : 's'} pendiente${unfinished === 1 ? '' : 's'} siguen en este espacio.`)}</p>
      </div>
      </div>
      <p class="continuity-footnote">${t('This comparison changes no records and predicts no agency decision. Change the time above freely.', 'Esta comparación no cambia registros ni predice decisiones del condado. Puedes cambiar el tiempo libremente.')}</p>
      </section>
    <aside class="panel continuity-dates">
      <div class="continuity-card-heading">
      <div>
      <span class="continuity-kicker">${t('ONLY DATES YOU CHECKED', 'SOLO FECHAS QUE VERIFICASTE')}</span>
      <h3>${t('Your confirmed timeline', 'Tu cronología verificada')}</h3>
      </div>
      <span class="continuity-date-icon" aria-hidden="true">◷</span>
      </div>${
        assessment.timeline.length
          ? `<ol class="continuity-date-list">${assessment.timeline
              .slice(0, 6)
              .map(
                (fact) => `<li>
      <time datetime="${escape(fact.date)}">${escape(date(fact.date))}</time>
      <strong>${fact.deadline.kind === 'interview' ? t('Interview', 'Entrevista') : fact.contextOnly ? t('Certification end — context', 'Fin de certificación — contexto') : fact.deadline.kind === 'submit' ? t('Requested submission date', 'Fecha solicitada de envío') : t('Date from the letter', 'Fecha del aviso')}</strong>
      <p>${escape(fact.noticeTitle)}${fact.days !== null ? ` · ${fact.days < 0 ? t(`${Math.abs(fact.days)} days after this date`, `${Math.abs(fact.days)} días después de esta fecha`) : fact.days === 0 ? t('Today', 'Hoy') : t(`In ${fact.days} days`, `En ${fact.days} días`)}` : ''}</p>${sourceButton(fact.noticeId, fact.deadline.line, t('Check wording', 'Ver texto'))}</li>`,
              )
              .join(
                '',
              )}</ol>${assessment.timeline.length > 6 ? `<p class="continuity-footnote">${t(`${assessment.timeline.length - 6} more checked dates are available in your letters.`, `Hay ${assessment.timeline.length - 6} fechas verificadas más en tus avisos.`)}</p>` : ''}`
          : `<p class="continuity-explainer">${t('Check a date in its original letter to add it here. Unchecked dates are kept out of this timeline.', 'Verifica una fecha en el aviso original para agregarla aquí. Las fechas sin verificar no aparecen en esta cronología.')}</p>`
      }${assessment.unverifiedDates ? `<div class="continuity-date-warning">${t(`${assessment.unverifiedDates} date${assessment.unverifiedDates === 1 ? '' : 's'} still need${assessment.unverifiedDates === 1 ? 's' : ''} review.`, `Falta verificar ${assessment.unverifiedDates} fecha${assessment.unverifiedDates === 1 ? '' : 's'}.`)}</div>` : ''}<p class="continuity-footnote">${t('A certification end date is never converted into a submission deadline.', 'Una fecha de fin de certificación nunca se convierte en una fecha límite de envío.')}</p>
      </aside>
      </div>
    <section class="panel continuity-paths">
      <div class="continuity-card-heading">
      <div>
      <span class="continuity-kicker">${t('NO STEPS LOST BETWEEN LETTERS', 'SIN PERDER PASOS ENTRE AVISOS')}</span>
      <h3>${t('What is moving. What needs attention.', 'Qué avanza. Qué necesita atención.')}</h3>
      </div>
      <span class="tag gray">${workspace.notices.length} ${t('letters', 'avisos')}</span>
      </div>
      <div class="continuity-lanes">${assessment.lanes.map(laneMarkup).join('')}</div>
      </section>
    ${
      assessment.comparisons.length
        ? `<section class="panel continuity-comparisons">
      <div class="continuity-card-heading">
      <h3>${t('Check these letters together', 'Revisar estos avisos juntos')}</h3>
      </div>${assessment.comparisons
        .map(
          (comparison) => `<div class="continuity-comparison">
      <span aria-hidden="true">!</span>
      <div>
      <h4>${comparison.kind === 'duplicate-notice' ? t('The same notice text was added twice', 'El mismo texto de aviso se agregó dos veces') : t('Different dates in similar letters', 'Fechas distintas en avisos similares')}</h4>
      <p>${comparison.kind === 'duplicate-notice' ? t('Both originals and their records are preserved. Check whether this is a duplicate before acting twice.', 'Se conservan ambos originales y sus registros. Verifica si es un duplicado antes de actuar dos veces.') : t('These may describe separate steps or cases. Ask which instructions apply; neither letter automatically replaces the other.', 'Podrían describir pasos o casos distintos. Consulta qué instrucciones corresponden; ningún aviso reemplaza automáticamente al otro.')}</p>
      <div class="continuity-match-actions">${comparison.noticeIds.map((id, index) => sourceButton(id, undefined, t(`Letter ${index + 1}`, `Aviso ${index + 1}`))).join('')}</div>
      </div>
      </div>`,
        )
        .join('')}</section>`
        : ''
    }
    ${
      assessment.evidenceCandidates.length
        ? `<section class="panel continuity-reuse">
      <div class="continuity-card-heading">
      <div>
      <span class="continuity-kicker">${t('LESS REPEATED PAPERWORK', 'MENOS PAPELEO REPETIDO')}</span>
      <h3>${t('Evidence you may be able to prepare once', 'Documentos que podrías preparar una sola vez')}</h3>
      </div>
      </div>${assessment.evidenceCandidates.map(reuseMarkup).join('')}<p class="continuity-footnote">${t('A reuse choice never marks another request prepared or submitted. Each letter keeps its own checklist and submission record.', 'La decisión de reutilización no marca otra solicitud como preparada o enviada. Cada aviso conserva su lista y registro de envío.')}</p>
      </section>`
        : ''
    }
  </section>`;
}
