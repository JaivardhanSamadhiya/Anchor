// Anchor application interface. Uploaded content is escaped before display.
import {
  analyzeNotice,
  reconcileNotices,
  formatDate,
  daysUntil,
  createCalendar,
} from './engine.js';
import { SOURCES, COUNTIES, DEMO_NOTICES } from './data.js';
import {
  extractFile,
  saveState,
  loadState,
  clearState,
  saveAttachment,
  getAttachment,
  downloadFile,
  buildHandoff,
  buildBackup,
  escapeHTML,
} from './platform.js';
import { createAccountSync } from './account.js';
import { createGuide } from './guide.js';
import { createAccountUI } from './account-ui.js';
import { renderContinuity } from './continuity-view.js';
import { assessContinuity, validDate } from './continuity.js';
import { createConfiguredSupabaseTransport } from './supabase-transport.js';
import { settings } from './config.js';
import { createNextStepCue } from './next-step-cue.js';
import {
  getFormAssistance,
  createFormDraft,
  updateFormDraft,
  toPdfFieldValues,
  formDraftSummary,
} from './form-assistance.js';
import { renderFormAssistance } from './form-assistance-view.js';
import { createProgramAssistant } from './assistant-ui.js';
import { getCalendarCandidates, createCalendarEvent } from './google-calendar.js';
import { createCalendarClient } from './google-calendar-client.js';

// Resolve assets beside this module so the same build works under /Anchor/.
const assetURL = (path) => new URL(path.replace(/^\//, ''), import.meta.url).href;
const $ = (selector, root = document) => root.querySelector(selector);
const e = escapeHTML;
const app = $('#app'),
  modal = $('#modal');
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  list: '<rect x="4" y="3" width="16" height="19" rx="2"/><path d="m8 8 1 1 2-2M14 8h3M8 14h2M14 14h3M8 18h2M14 18h3"/>',
  folder:
    '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8h18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  external:
    '<path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9z"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v4M12 17h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  leaf: '<path d="M20 3c0 12-4 17-10 17a6 6 0 0 1-6-6C4 7 10 3 20 3zM4 20 15 9"/>',
  print:
    '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6zM18 12h.01"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}
let state,
  page = 'overview',
  selected = null,
  highlightLine = null,
  navOpen = false,
  importTab = 'upload',
  busy = false,
  importError = '',
  storageFailed = false;
let account, guide, accountTransport, nextStepCue;
let signInTourPending = false;
let activeForm = null,
  formPreviewGeneration = 0;
let calendarStatus = '',
  calendarBusy = false,
  calendarIdentityReady = false,
  calendarPreparing = false,
  calendarPreparationFailed = false,
  calendarPending = null;
const calendarClient = createCalendarClient({ clientId: settings.googleClientId });
const assistant = createProgramAssistant({
  getAccount: () => accountInfo,
  getLanguage: () => state?.lang || 'en',
  ask: (request, signal) => accountTransport.askProgram(request, signal),
  redraw: () => {
    if (page === 'assistant') render({ captureAssistant: false });
  },
  navigate: (destination) => navigate(destination),
  escapeHTML: e,
});
const PAGES = [
  'overview',
  'notices',
  'plan',
  'evidence',
  'continuity',
  'forms',
  'calendar',
  'assistant',
  'support',
  'about',
];
let clarificationRenderDeferred = false;
let pointerDown = false;
// Timebox changes are reversible planning preferences, never notice facts.
let continuityCapacity = 30;
let accountInfo = { authenticated: false, configured: false, syncState: 'guest', pendingCount: 0 };
const t = (en, es) => (state?.lang === 'es' ? es : en);
const uid = () => crypto.randomUUID();
const accountUI = createAccountUI({
  getInfo: () => accountInfo,
  getState: () => state,
  translate: t,
  escapeHTML: e,
  icon,
  showModal,
  modalHead,
  modal,
  account: () => account,
});
const {
  syncLabel,
  badge: syncBadge,
  button: accountButton,
  alert: syncAlert,
  open: accountModal,
} = accountUI;
const storeFile = (file) =>
  accountInfo.authenticated && state.mode === 'personal'
    ? account.saveAttachment(file)
    : saveAttachment(file);
const readFileAttachment = (id) =>
  accountInfo.authenticated && state.mode === 'personal'
    ? account.getAttachment(id)
    : getAttachment(id);
function flowNavigation() {
  return `<div class="workspace-toolbar"><div class="workspace-toggle" role="group" aria-label="${t('Choose workspace', 'Elegir espacio')}"><button data-action="workspace-personal" aria-pressed="${state.mode === 'personal'}">${t('My workspace', 'Mi espacio')}</button><button data-action="workspace-demo" aria-pressed="${state.mode === 'demo'}">${t('Practice', 'Práctica')}</button></div><button class="guide-button" data-action="guide">${icon('help', 15)}${t('Show me how', 'Mostrarme cómo')}</button></div><nav class="flow-nav" aria-label="${t('Your next steps', 'Tus siguientes pasos')}">${[
    ['notices', t('Add & review', 'Agregar y revisar')],
    ['plan', t('Prepare', 'Preparar')],
    ['evidence', t('Save receipts', 'Guardar recibos')],
  ]
    .map(
      ([p, title], i) =>
        `<button data-action="nav" data-page="${p}" class="${page === p ? 'active' : ''}" ${page === p ? 'aria-current="page"' : ''}><span>${i + 1}</span>${title}${icon('chevron', 11)}</button>`,
    )
    .join('')}</nav>`;
}
const workspace = () => state[state.mode];
const noticeById = (id) => workspace().notices.find((n) => n.id === id);
const fmt = (iso) =>
  iso ? formatDate(iso, state.lang) : t('Date needs review', 'Fecha por revisar');
const refToday = () =>
  state.mode === 'demo'
    ? /* @__PURE__ */ new Date('2026-10-09T12:00:00-07:00')
    : /* @__PURE__ */ new Date();
function captureFocus() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  for (const attr of ['data-confirm', 'data-exclude', 'data-task']) {
    if (el.hasAttribute(attr)) return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
  }
  if (el.dataset.action === 'continuity-capacity')
    return `[data-action="continuity-capacity"][data-minutes="${CSS.escape(el.dataset.minutes)}"]`;
  if (el.dataset.action)
    return `[data-action="${CSS.escape(el.dataset.action)}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}`;
  return null;
}
const niceDay = (iso) =>
  iso
    ? /* @__PURE__ */ new Date(iso + 'T12:00:00').toLocaleDateString(
        state.lang === 'es' ? 'es-US' : 'en-US',
        { month: 'short', day: 'numeric' },
      )
    : '\u2014';
const month = (iso) =>
  iso
    ? /* @__PURE__ */ new Date(iso + 'T12:00:00')
        .toLocaleDateString(state.lang === 'es' ? 'es-US' : 'en-US', { month: 'short' })
        .replace('.', '')
        .toUpperCase()
    : '\u2014';
const statusTag = (n) =>
  !n.supported || n.warnings.length || n.deadlines.some((d) => d.needsReview && !d.confirmed)
    ? `<span class="tag amber">${icon('eye', 11)}${t('Needs a closer look', 'Requiere revisi\xF3n')}</span>`
    : n.reviewed
      ? `<span class="tag green">${icon('check', 11)}${t('Plan reviewed', 'Plan revisado')}</span>`
      : `<span class="tag amber">${t('Ready to review', 'Listo para revisar')}</span>`;
const requests = () =>
  workspace().notices.flatMap((n) => n.requests.map((r) => ({ ...r, notice: n })));
const upcoming = () =>
  workspace()
    .notices.flatMap((n) =>
      n.deadlines
        .filter((d) => d.date && !d.excluded && d.kind !== 'end')
        .map((d) => ({ ...d, notice: n })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
const label = (d) =>
  d.kind === 'interview'
    ? t('Interview appointment', 'Cita de entrevista')
    : d.kind === 'end'
      ? t('Certification ends', 'Fin de certificaci\xF3n')
      : t('Return requested items', 'Enviar lo solicitado');
const completed = () => requests().filter((r) => r.status === 'done').length;
const progress = () =>
  requests().length ? Math.round((completed() / requests().length) * 100) : 0;
function hasCompetingDates(n) {
  return n.deadlines.some(
    (d) =>
      d.date &&
      n.deadlines.some(
        (other) =>
          other.kind === d.kind &&
          (other.originalDate || other.date) &&
          (other.originalDate || other.date) !== (d.originalDate || d.date),
      ),
  );
}
function planReady(n) {
  return (
    n.supported &&
    n.deadlines.some((d) => d.confirmed && d.date && !d.excluded) &&
    n.deadlines.every((d) => d.excluded || (d.confirmed && d.date)) &&
    (!hasCompetingDates(n) || Boolean(n.clarification?.trim()))
  );
}
const thumb = () =>
  '<div class="notice-thumb" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
const ext = (url, labelText, classes = 'button light') =>
  `<a class="${classes}" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(labelText)}${icon('external', 13)}</a>`;
function sampleWorkspace() {
  return {
    notices: DEMO_NOTICES.slice(0, 2).map((n) => ({
      ...analyzeNotice(n.text, {
        id: 'demo-' + n.id,
        filename: n.filename,
        county: n.county,
        isDemo: true,
        now: '2026-10-09T19:00:00-07:00',
      }),
      reviewed: false,
    })),
    events: [],
  };
}
function freshState() {
  return {
    version: 1,
    mode: 'demo',
    lang: 'en',
    county: 'santa-clara',
    demo: sampleWorkspace(),
    personal: { notices: [], events: [] },
  };
}
async function persist() {
  try {
    if (account) await account.persist(state);
    else await saveState(state);
    storageFailed = false;
    return true;
  } catch {
    storageFailed = true;
    toast(
      t(
        'This browser could not save your changes. Download a backup to keep them.',
        'El navegador no pudo guardar los cambios. Descarga una copia.',
      ),
    );
    return false;
  }
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
async function accountAction(action) {
  if (busy)
    throw new Error(
      t('Please wait for the current action.', 'Espera a que termine la acción actual.'),
    );
  busy = true;
  const buttons = [...modal.querySelectorAll('button')].map((button) => ({
    button,
    disabled: button.disabled,
  }));
  buttons.forEach(({ button }) => (button.disabled = true));
  try {
    return await action();
  } finally {
    busy = false;
    buttons.forEach(({ button, disabled }) => {
      if (button.isConnected) button.disabled = disabled;
    });
  }
}
function event(kind, title, noticeId, detail = '', extra = {}) {
  workspace().events.unshift({
    id: uid(),
    kind,
    title,
    noticeId,
    detail,
    date: /* @__PURE__ */ new Date().toISOString(),
    ...extra,
  });
}

// Agency responses are resident records tied to one submission, not a status
// received from an agency API. The distinction stays visible in the dialog.
function currentCalendarDay() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
function acknowledgmentModal(noticeId, submissionId) {
  const n = noticeById(noticeId);
  const submission = workspace().events.find(
    (item) => item.id === submissionId && item.noticeId === noticeId && item.kind === 'submitted',
  );
  if (!n || !submission)
    throw new Error(
      t('That submission is no longer available.', 'Ese envío ya no está disponible.'),
    );
  showModal(
    modalHead(
      t('Record an agency response', 'Registrar una respuesta de la agencia'),
      t('Keep what the agency actually told you.', 'Conserva lo que la agencia te comunicó.'),
    ) +
      `<div class="modal-body"><div class="source-info">${t('This records your report of a response. It does not mean the agency approved benefits or accepted every document.', 'Esto registra tu informe de una respuesta. No significa que la agencia aprobó beneficios ni aceptó todos los documentos.')}</div><form id="acknowledgment-form" data-notice="${e(noticeId)}" data-submission="${e(submissionId)}"><div class="field"><label for="agency-date">${t('Response date', 'Fecha de respuesta')}</label><input id="agency-date" name="date" type="date" required min="${e(submission.date.slice(0, 10))}" max="${currentCalendarDay()}"></div><div class="field"><label for="agency-detail">${t('What did the agency say? Include a reference if you have one.', '¿Qué dijo la agencia? Incluye una referencia si la tienes.')}</label><textarea id="agency-detail" name="detail" required maxlength="2000" rows="4"></textarea></div><button class="button" type="submit">${t('Save response record', 'Guardar respuesta')}</button></form></div>`,
  );
}
// Share the domain's complete matching policy with both dialog opening and save.
// Recheck at save time because a restored account can change while a dialog is open.
function currentEvidenceMatch(targetId, requestId, sourceId, sourceRequestId) {
  return assessContinuity(workspace()).evidenceCandidates.find(
    (candidate) =>
      !candidate.chosen &&
      candidate.targetNotice.id === targetId &&
      candidate.targetRequest.id === requestId &&
      candidate.sourceNotice.id === sourceId &&
      candidate.sourceRequest.id === sourceRequestId,
  );
}
function reuseModal(button) {
  const candidate = currentEvidenceMatch(
    button.dataset.id,
    button.dataset.task,
    button.dataset.sourceNotice,
    button.dataset.sourceTask,
  );
  if (!candidate)
    throw new Error(
      t(
        'Review both original requests before linking evidence.',
        'Revisa ambas solicitudes originales antes de vincular pruebas.',
      ),
    );
  const {
    targetNotice: target,
    sourceNotice: source,
    targetRequest: requested,
    sourceRequest: prepared,
  } = candidate;
  showModal(
    modalHead(
      t('Link a possible evidence match', 'Vincular una posible prueba'),
      e(requested.title),
    ) +
      `<div class="modal-body"><p class="body-text">${t('The wording matches a prepared item in another notice. Confirm the person, time period, and exact instructions yourself. Linking adds a note; it does not mark anything prepared or submitted.', 'El texto coincide con un elemento preparado en otro aviso. Confirma la persona, el período y las instrucciones exactas. El vínculo añade una nota; no marca nada como preparado ni enviado.')}</p><form id="reuse-form" data-notice="${e(target.id)}" data-task="${e(requested.id)}" data-source-notice="${e(source.id)}" data-source-task="${e(prepared.id)}"><label class="continuity-confirm"><input type="checkbox" name="checked" required>${t('I checked both original notices and the document details.', 'Revisé ambos avisos originales y los detalles del documento.')}</label><div class="field"><label for="reuse-detail">${t('What did you check?', '¿Qué verificaste?')}</label><textarea id="reuse-detail" name="detail" required maxlength="1000" rows="3"></textarea></div><button class="button" type="submit">${t('Save evidence link', 'Guardar vínculo')}</button></form></div>`,
  );
}

function illustration() {
  return `<svg class="next-illustration" viewBox="0 0 240 260" fill="none" aria-hidden="true"><path d="M23 225c34-37 73-59 117-47 37 11 65 26 99 8v74H23z" fill="#376154"/><path d="M20 231c32-17 62-14 94-1 52 21 75 0 126-5" stroke="#9eac7c" stroke-width="1.5"/><g transform="rotate(12 153 120)"><rect x="89" y="47" width="105" height="144" rx="8" fill="#f2f0df"/><rect x="101" y="62" width="37" height="6" rx="2" fill="#83a58a"/><path d="M101 83h67M101 92h57M101 101h65" stroke="#bccbb4" stroke-width="3" stroke-linecap="round"/><rect x="101" y="119" width="81" height="32" rx="3" fill="#e8d7a4"/><path d="m108 134 5 5 10-11M132 129h38M132 139h27" stroke="#748d67" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M101 168h67M101 177h46" stroke="#bccbb4" stroke-width="3" stroke-linecap="round"/></g><circle cx="86" cy="189" r="33" fill="#e7c782"/><circle cx="86" cy="189" r="23" fill="#173c3d"/><path d="m73 189 9 9 17-19" stroke="#f0d797" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M208 27v17M200 35h16M66 75v11M60 81h12" stroke="#d9bd7c" stroke-width="1.5" stroke-linecap="round"/><circle cx="208" cy="149" r="3" fill="#8cb499"/><circle cx="66" cy="134" r="2" fill="#8cb499"/></svg>`;
}
function shell(content) {
  const names = {
    overview: t('Home', 'Inicio'),
    notices: t('1. Add & review', '1. Agregar y revisar'),
    plan: t('2. Prepare', '2. Preparar'),
    evidence: t('3. Save receipts', '3. Guardar recibos'),
    continuity: t('Continuity', 'Continuidad'),
    forms: t('Guided forms', 'Formularios guiados'),
    calendar: t('Calendar', 'Calendario'),
    assistant: t('Ask Anchor', 'Pregunta a Anchor'),
    support: t('Get support', 'Obtener ayuda'),
    about: t('About Anchor', 'Acerca de Anchor'),
  };
  return `<div class="shell ${navOpen ? 'nav-open' : ''}"><button class="nav-overlay" data-action="menu" aria-label="${t('Close navigation', 'Cerrar navegaci\xF3n')}"></button><aside class="sidebar"><a class="brand" href="#overview" data-action="nav" data-page="overview"><img src="./icon.svg" alt="">Anchor</a><div class="brand-sub">${t('A little clarity goes a long way', 'Claridad para seguir adelante')}</div><div class="nav-label">${t('YOUR WORKSPACE', 'TU ESPACIO')}</div><nav class="nav" aria-label="${t('Main navigation', 'Navegaci\xF3n principal')}">${[
    ['overview', 'grid'],
    ['notices', 'file'],
    ['plan', 'list'],
    ['evidence', 'folder'],
    ['continuity', 'shield'],
    ['forms', 'file'],
    ['calendar', 'calendar'],
  ]
    .map(
      ([p, i]) =>
        `<button data-action="nav" data-page="${p}" class="${page === p ? 'active' : ''}" ${page === p ? 'aria-current="page"' : ''}>${icon(i)}${names[p]}${p === 'notices' && workspace().notices.length ? `<span class="count">${workspace().notices.length}</span>` : ''}</button>`,
    )
    .join(
      '',
    )}<div class="nav-label" style="margin-top:26px">${t('HERE TO HELP', 'AQU\xCD PARA AYUDAR')}</div>${[
    ['support', 'heart'],
    ['assistant', 'spark'],
    ['about', 'info'],
  ]
    .map(
      ([p, i]) =>
        `<button data-action="nav" data-page="${p}" class="${page === p ? 'active' : ''}">${icon(i)}${names[p]}</button>`,
    )
    .join(
      '',
    )}</nav><div class="side-bottom"><div class="side-note">${icon('shield', 23)}<strong>${t('Your information stays yours.', 'Tu informaci\xF3n te pertenece.')}</strong>${t('Sign in to save across devices. Practice notices and your own letters stay separate.', 'Inicia sesión para guardar en varios dispositivos. Tus avisos y ejemplos están separados.')}</div><div class="side-footer"><span class="dot"></span>${t('Made for peace of mind', 'Creado para tu tranquilidad')}</div></div></aside><div class="main-wrap"><header class="topbar"><div class="topbar-left"><button class="mobile-nav-toggle" data-action="menu" aria-label="${t('Open navigation', 'Abrir navegaci\xF3n')}" aria-expanded="${navOpen}">${icon('menu', 20)}</button><div class="mobile-brand"><img src="./icon.svg" alt="">Anchor</div><div class="breadcrumb">${t('Workspace', 'Espacio')} ${icon('chevron', 11)} <strong>${names[page]}</strong></div></div><div class="top-controls">${syncBadge()}<label class="lang-toggle">${icon('globe', 15)}<select id="language" aria-label="${t('Interface language', 'Idioma de la interfaz')}"><option value="en" ${state.lang === 'en' ? 'selected' : ''}>English</option><option value="es" ${state.lang === 'es' ? 'selected' : ''}>Espa\xF1ol</option></select></label>${accountButton()}</div></header><main id="main" class="content" tabindex="-1">${state.mode === 'demo' ? `<div class="sample-strip">${icon('spark', 14)}<span>${t('Sample workspace \xB7 Fictional notices. Practice freely; your own letters stay separate.', 'Espacio de pr\xE1ctica \xB7 Avisos ficticios. Tus propios avisos se guardan por separado.')}</span><button data-action="switch-mode">${t('Go to my workspace', 'Ir a mi espacio')}${icon('arrow', 11)}</button></div>` : storageFailed ? `<div class="review-warning">${icon('warning', 16)}${t('Changes are not saved in this browser. Download a backup.', 'Los cambios no se guardan en este navegador. Descarga una copia.')}</div>` : ''}${flowNavigation()}${syncAlert()}${content}<footer class="footer"><span>${icon('lock', 11)}${t('Read on your device. Sign in to save your progress.', 'Lectura local. Inicia sesión para guardar tu progreso.')}</span><div class="footer-links"><button data-action="guide">${t('Guide', 'Guía')}</button><button data-action="privacy">${t('Privacy & storage', 'Privacidad')}</button><button data-action="nav" data-page="support">${t('Official resources', 'Recursos oficiales')}${icon('external', 10)}</button></div></footer></main></div></div>`;
}
function formsPage() {
  const notices = workspace().notices;
  return (
    head(
      t('Prepare with a guide.', 'Prepara con una guía.'),
      t(
        'Open the official form when it is verified. Work through the request one step at a time.',
        'Abre el formulario oficial cuando se identifica. Prepara la solicitud paso a paso.',
      ),
    ) +
    (!notices.length
      ? empty(
          t('Start with your notice.', 'Empieza con tu aviso.'),
          t(
            'A guide stays attached to its original request.',
            'La guía se conserva con su solicitud original.',
          ),
        )
      : notices
          .map(
            (notice) =>
              `<section class="panel calendar-panel"><h2>${e(notice.title)}</h2><p class="hint">${t('Drafts are preparation only. Check the county’s actual form before signing and submitting.', 'Los borradores son preparación. Revisa el formulario del condado antes de firmar y enviar.')}</p>${(notice.requests.length ? notice.requests : [{ id: null, title: t('Review this notice with a guide', 'Revisar este aviso con una guía') }]).map((request) => `<div class="calendar-event"><div><strong>${e(request.title)}</strong><p>${e(getFormAssistance(notice, request.id).rationale)}</p><button class="button light small" data-action="form-open" data-id="${e(notice.id)}" ${request.id ? `data-task="${e(request.id)}"` : ''}>${t('Open guided preparation', 'Abrir preparación guiada')} →</button></div></div>`).join('')}</section>`,
          )
          .join(''))
  );
}

function formRecord(context = activeForm) {
  if (!context || context.owner !== `${accountInfo.user?.id || 'guest'}:${state.mode}`) return null;
  const notice = noticeById(context.assistance.noticeId);
  if (!notice) return null;
  notice.formDrafts ||= [];
  return notice.formDrafts.find((record) => record.id === context.draft.id) || null;
}

async function saveActiveForm() {
  const context = activeForm,
    record = formRecord(context);
  if (!record) return;
  const updates = {};
  for (const field of modal.querySelectorAll('[data-form-field]'))
    updates[field.dataset.formField] = field.type === 'checkbox' ? field.checked : field.value;
  context.draft = updateFormDraft(context.assistance, context.draft, updates);
  record.draft = context.draft;
  return persist();
}

function openForm(noticeId, requestId) {
  const notice = noticeById(noticeId);
  if (!notice) return;
  const assistance = getFormAssistance(notice, requestId);
  const draft = createFormDraft(assistance);
  notice.formDrafts ||= [];
  let record = notice.formDrafts.find((item) => item.id === draft.id);
  if (!record) {
    record = { id: draft.id, draft };
    notice.formDrafts.push(record);
  }
  activeForm = {
    assistance,
    draft: updateFormDraft(assistance, record.draft, {}),
    section: 0,
    previewPage: assistance.sections[0].page,
    owner: `${accountInfo.user?.id || 'guest'}:${state.mode}`,
  };
  showActiveForm();
}

function showActiveForm() {
  const record = formRecord();
  if (!record) return;
  showModal(
    modalHead(t('Prepare your requested item', 'Prepara lo solicitado')) +
      renderFormAssistance({
        assistance: activeForm.assistance,
        draft: activeForm.draft,
        activeSection: activeForm.section,
        previewPage: activeForm.previewPage,
        previewPages: activeForm.previewPages,
        previewLabel: record.filename,
        hasAttachedForm: Boolean(record.attachmentId),
        lang: state.lang,
      }),
    true,
  );
  const form = $('#form-assistance-draft');
  if (form)
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const saved = await saveActiveForm();
      const status = $('#form-assist-save-status');
      if (status)
        status.textContent = saved
          ? t(
              'Draft saved. Nothing has been signed or submitted.',
              'Borrador guardado. Nada se ha firmado ni enviado.',
            )
          : t(
              'This browser could not save the draft. Download preparation notes to keep it.',
              'El navegador no pudo guardar el borrador. Descarga las notas para conservarlo.',
            );
    });
  renderActiveFormPage();
}

async function renderActiveFormPage() {
  const context = activeForm,
    record = formRecord(context),
    canvas = $('#form-preview-canvas');
  if (!canvas || !record) return;
  const token = ++formPreviewGeneration;
  try {
    const documents = await import('./form-documents.js');
    let bytes;
    if (record.attachmentId) {
      const attached = await readFileAttachment(record.attachmentId);
      const blob = attached?.blob || attached;
      if (!blob?.arrayBuffer) throw new Error('Attach the actual form again to preview it.');
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else bytes = await documents.loadOfficialForm(context.assistance.form);
    if (token !== formPreviewGeneration || context !== activeForm || !canvas.isConnected) return;
    const pages = await documents.renderFormPage(bytes, canvas, context.previewPage);
    if (token !== formPreviewGeneration || context !== activeForm) return;
    context.previewPages = pages;
    context.previewPage = Math.min(pages, context.previewPage);
    const status = $('#form-preview-status');
    if (status)
      status.textContent = record.attachmentId
        ? t('Your attached form · read locally', 'Tu formulario adjunto · lectura local')
        : t('Official blank · read locally', 'Formulario oficial · lectura local');
  } catch (error) {
    if (token === formPreviewGeneration) {
      const status = $('#form-preview-status');
      if (status) status.textContent = error.message;
    }
  }
}

function calendarPage() {
  const candidates = getCalendarCandidates(workspace().notices, state.lang);
  return (
    head(
      t('Keep your dates in view.', 'Conserva tus fechas a la vista.'),
      t(
        'Preview checked dates, then choose what to add to Google Calendar.',
        'Revisa las fechas verificadas y elige cuáles agregar a Google Calendar.',
      ),
      t('YOUR CALENDAR', 'TU CALENDARIO'),
      false,
    ) +
    `<section class="panel calendar-panel"><h2>${t('Checked dates only', 'Solo fechas verificadas')}</h2><p class="body-text">${t('Anchor creates private, all-day reminders with a general title. It sends the dates and reminder text shown here, without your letter, case number, or form answers. It does not read your calendar.', 'Anchor crea recordatorios privados de todo el día. Envía las fechas y texto mostrados aquí, sin el aviso, número de caso o respuestas. No lee tu calendario.')}</p>${state.mode === 'demo' ? `<p class="review-warning">${t('Practice mode: these dates are fictional. Google Calendar writes are available in your personal workspace.', 'Modo de práctica: fechas ficticias. Google Calendar está disponible en tu espacio personal.')}</p>` : ''}<form id="calendar-form">${candidates.map((candidate, index) => `<label class="calendar-event"><input type="checkbox" name="event" value="${index}" checked><span><strong>${e(candidate.summary)}</strong><p>${fmt(candidate.date)} · ${t('All day', 'Todo el día')}</p><p>${e(candidate.description)}</p>${candidate.contextOnly ? `<p class="hint">${t('A context reminder, not a submission deadline.', 'Recordatorio de contexto, no fecha de envío.')}</p>` : ''}</span></label>`).join('')}${!candidates.length ? `<p class="hint">${t('Review a notice and check its dates against the original first. Uncertain or competing dates cannot be added.', 'Revisa un aviso y verifica las fechas originales. No se agregan fechas inciertas o contradictorias.')}</p>` : ''}<div class="button-row gap-top"><button type="button" class="button" data-action="calendar-connect" ${!candidates.length || state.mode === 'demo' || calendarBusy || !calendarIdentityReady ? 'disabled' : ''}>${calendarClient.connected ? t('Review & add selected dates', 'Revisar y agregar fechas') : t('Connect Google Calendar', 'Conectar Google Calendar')}</button><button type="button" class="button light" data-action="calendar-all">${t('Download calendar file', 'Descargar archivo de calendario')}</button>${calendarClient.connected ? `<button type="button" class="link-button" data-action="calendar-disconnect">${t('Disconnect this session', 'Desconectar esta sesión')}</button>` : ''}</div></form><p id="calendar-status" class="hint" role="status">${e(calendarStatus)}</p><details><summary>${t('Google Calendar setup', 'Configuración de Google Calendar')}</summary><p class="hint">${t('Calendar access is separate from Anchor sign-in. Choose the Google account whose calendar you want to use. Disconnect this session forgets Anchor’s temporary token; you can remove the permission in your Google Account. The calendar file works without a connection.', 'El propietario debe habilitar Google Calendar API y agregar calendar.events.owned en Google Auth Platform. El permiso se solicita separado del inicio de sesión. Puedes descargar el archivo de calendario.')}</p></details></section>`
  );
}

function prepareCalendar() {
  if (
    calendarIdentityReady ||
    calendarPreparing ||
    calendarPreparationFailed ||
    page !== 'calendar'
  )
    return;
  calendarPreparing = true;
  calendarClient
    .prepare()
    .then(() => {
      calendarIdentityReady = true;
      calendarStatus = t(
        'Select dates, then connect Google Calendar when you are ready.',
        'Selecciona fechas y conecta Google Calendar cuando estés listo.',
      );
    })
    .catch((error) => {
      calendarPreparationFailed = true;
      calendarStatus = error.message;
    })
    .finally(() => {
      calendarPreparing = false;
      if (page === 'calendar') render();
    });
}

function previewCalendar(candidates) {
  calendarPending = { candidates, owner: `${accountInfo.user?.id || 'guest'}:${state.mode}` };
  showModal(
    modalHead(t('Review your Google Calendar events', 'Revisa los eventos de Google Calendar')) +
      `<div class="modal-body"><p class="body-text">${t('These private, all-day reminders will be added to the primary calendar of the Google account you chose. Google’s permission covers viewing and editing owned-calendar events; Anchor only creates the reminders you confirm here.', 'Estos recordatorios privados se agregan al calendario principal de la cuenta de Google elegida. El permiso de Google incluye ver y editar eventos; Anchor solo crea los recordatorios que confirmas.')}</p>${candidates.map((item) => `<div class="calendar-event"><div><strong>${e(item.summary)}</strong><p>${fmt(item.date)} · ${t('All day', 'Todo el día')}</p><p>${e(item.description)}</p></div></div>`).join('')}<div class="button-row gap-top"><button class="button" data-action="calendar-create">${t('Add these events', 'Agregar estos eventos')}</button><button class="button light" data-action="close-modal">${t('Cancel', 'Cancelar')}</button></div><p id="calendar-create-status" class="hint" role="status"></p></div>`,
  );
}

function updateNextStep() {
  if (!nextStepCue || !state) return;
  const pending = workspace().notices.find((notice) => !notice.reviewed);
  let cue = null;
  if (page === 'notices' && selected) {
    const notice = noticeById(selected);
    if (notice && !notice.reviewed && notice.supported && planReady(notice))
      cue = {
        key: `plan:${accountInfo.user?.id || 'guest'}:${state.mode}:${notice.id}`,
        selector: '[data-action="confirm-plan"]',
        title: t(
          'Your dates are checked. Open your plan.',
          'Tus fechas están verificadas. Abre tu plan.',
        ),
        detail: t(
          'This organizes your preparation steps.',
          'Esto organiza tus pasos de preparación.',
        ),
      };
    else if (notice && !notice.reviewed) {
      const date = notice.deadlines.find((item) => !item.confirmed && !item.excluded);
      if (date)
        cue = {
          key: `date-source:${accountInfo.user?.id || 'guest'}:${state.mode}:${notice.id}:${date.id}`,
          selector: `.review-card [data-action="source"][data-id="${CSS.escape(notice.id)}"][data-line="${Number(date.line) || 1}"]`,
          title: t(
            'Next: check this date in the letter.',
            'Siguiente: verifica esta fecha en el aviso.',
          ),
          detail: t(
            'Read the original wording. Confirm the date only after checking it.',
            'Lee el texto original. Confirma la fecha solo después de verificarla.',
          ),
          actionLabel: t('Show original wording', 'Mostrar texto original'),
        };
      else if (!notice.supported)
        cue = {
          key: `manual-guide:${accountInfo.user?.id || 'guest'}:${state.mode}:${notice.id}`,
          selector: `[data-action="form-open"][data-id="${CSS.escape(notice.id)}"]`,
          title: t(
            'Next: work through this request with a guide.',
            'Siguiente: prepara esta solicitud con una guía.',
          ),
          detail: t(
            'Use the original agency instructions; this notice needs human review.',
            'Usa las instrucciones originales; este aviso necesita revisión humana.',
          ),
        };
    }
  } else if (pending && ['overview', 'notices'].includes(page))
    cue = {
      key: `review:${accountInfo.user?.id || 'guest'}:${state.mode}:${pending.id}`,
      selector: `[data-action="review"][data-id="${CSS.escape(pending.id)}"]`,
      title: t('Start here: review this notice.', 'Empieza aquí: revisa este aviso.'),
      detail: t(
        'Check the dates and requests against the original.',
        'Verifica las fechas y solicitudes originales.',
      ),
    };
  else if (page === 'plan') {
    const request = requests().find((item) => item.status !== 'done' && item.notice.reviewed);
    if (request)
      cue = {
        key: `prepare:${accountInfo.user?.id || 'guest'}:${state.mode}:${request.notice.id}:${request.id}`,
        selector: `[data-action="form-open"][data-id="${CSS.escape(request.notice.id)}"][data-task="${CSS.escape(request.id)}"]`,
        title: t('Next: prepare this requested item.', 'Siguiente: prepara este elemento.'),
        detail: t(
          'Open its guided steps and any verified official form.',
          'Abre la guía y el formulario oficial identificado.',
        ),
      };
    else if (requests().length && completed() === requests().length)
      cue = {
        key: `receipt:${accountInfo.user?.id || 'guest'}:${state.mode}:${workspace()
          .notices.map((item) => item.id)
          .join(':')}`,
        selector: '[data-action="receipt"]',
        title: t(
          'After you submit, save your confirmation.',
          'Después de enviar, guarda la confirmación.',
        ),
        detail: t(
          'Use the official channel, then record what you actually sent.',
          'Usa el canal oficial y registra lo que enviaste.',
        ),
      };
  } else if (page === 'overview' && workspace().notices.length && !pending)
    cue = {
      key: `open-plan:${accountInfo.user?.id || 'guest'}:${state.mode}:${workspace()
        .notices.map((item) => item.id)
        .join(':')}`,
      selector: '[data-action="nav"][data-page="plan"].button',
      title: t('Next: open your preparation plan.', 'Siguiente: abre tu plan de preparación.'),
    };
  nextStepCue.update(cue);
}

function head(title, subtitle, eyebrow = t('ONE STEP AT A TIME', 'PASO A PASO'), button = true) {
  return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-sub">${subtitle}</p></div>${button ? `<button class="button" data-action="import">${icon('plus', 16)}${t('Add a notice', 'Agregar aviso')}</button>` : ''}</div>`;
}
function empty(title, subtitle) {
  return `<div class="panel empty-state">${icon('file', 36)}<h2>${title}</h2><p>${subtitle}</p><div class="button-row" style="justify-content:center"><button class="button" data-action="import">${icon('plus', 15)}${t('Add your first notice', 'Agregar tu primer aviso')}</button><button class="button light" data-action="demo">${t('Try the sample', 'Probar el ejemplo')}${icon('arrow', 14)}</button></div></div>`;
}
function noticeRow(n) {
  return `<div class="notice-row">${thumb()}<div class="notice-row-info"><h3>${e(n.title)}</h3><p>${e(n.formCode || t('Manual review', 'Revisi\xF3n manual'))} \xB7 ${e(COUNTIES[n.county]?.name || t('County not identified', 'Condado no identificado'))}</p>${statusTag(n)}</div><button class="arrow-button" data-action="review" data-id="${e(n.id)}" aria-label="${e(t('Review ', 'Revisar ') + n.title)}">${icon('arrow', 13)}</button></div>`;
}
function taskLine(r) {
  const help = getFormAssistance(r.notice, r.id);
  const next = help.checklist[0];
  return `<div class="task-line ${r.status === 'done' ? 'completed' : ''}"><button class="task-check ${r.status === 'done' ? 'done' : ''}" data-action="task" data-id="${e(r.notice.id)}" data-task="${e(r.id)}" aria-label="${e((r.status === 'done' ? t('Mark unprepared: ', 'Marcar sin preparar: ') : t('Mark prepared: ', 'Marcar preparado: ')) + r.title)}" aria-pressed="${r.status === 'done'}">${r.status === 'done' ? icon('check', 12) : ''}</button><div class="task-text"><h3>${e(r.title)}</h3><p>${e(r.notice.title)}${r.status === 'done' ? ` · ${t('Prepared by you', 'Preparado por ti')}` : ''}</p><p class="task-detail">${e(next?.detail || r.description || '')}</p><div class="task-assist-actions"><button class="button light small" data-action="form-open" data-id="${e(r.notice.id)}" data-task="${e(r.id)}">${icon('file', 12)}${help.form ? t('Open form & guide', 'Abrir formulario y guía') : t('Prepare with a guide', 'Preparar con una guía')}${icon('arrow', 12)}</button><button class="link-button" data-action="source" data-id="${e(r.notice.id)}" data-line="${r.line || 1}">${t('See in letter', 'Ver en el aviso')}${icon('link', 11)}</button></div></div></div>`;
}

function overview() {
  const notices = workspace().notices;
  if (!notices.length)
    return (
      head(
        t('Your next step,<br>made clear.', 'Tu siguiente paso,<br>m\xE1s claro.'),
        t(
          'Start with a letter. Build a plan you can trust.',
          'Empieza con un aviso. Crea un plan con informaci\xF3n verificable.',
        ),
      ) +
      empty(
        t('A clearer path starts here.', 'Aqu\xED empieza un camino m\xE1s claro.'),
        t(
          'Add a benefit notice to find its dates and requests. Review the original wording, then keep your next steps together.',
          'Agrega un aviso de beneficios para encontrar las fechas y solicitudes, revisar el texto original y organizar los siguientes pasos.',
        ),
      )
    );
  const soon = upcoming().find((d) => daysUntil(d.date, refToday()) >= 0) || upcoming()[0];
  const next = notices.find((n) => !n.reviewed) || notices[0];
  const days = soon ? daysUntil(soon.date, refToday()) : null;
  const all = requests();
  return (
    head(
      t('Your next step,<br>made clear.', 'Tu siguiente paso,<br>m\xE1s claro.'),
      t(
        'Less paperwork stress. More room for what matters.',
        'Menos estr\xE9s con el papeleo. M\xE1s espacio para lo importante.',
      ),
    ) +
    `<div class="dashboard-top"><section class="panel next-card"><div><div class="eyebrow">${icon('leaf', 13)}${t('YOUR NEXT CHAPTER', 'TU SIGUIENTE PASO')}</div><h2>${next.reviewed ? t('You have a plan.<br>Let\u2019s keep moving.', 'Ya tienes un plan.<br>Sigamos adelante.') : t('A letter today.<br>A clear path forward.', 'Un aviso hoy.<br>Un camino claro.')}</h2><p>${next.reviewed ? t('Your next steps are together. Prepare what\u2019s requested, then use the official submission channel.', 'Tus siguientes pasos est\xE1n organizados. Prepara lo solicitado y usa el canal oficial.') : t('Your notice is here. Let\u2019s check what it asks for and take it one step at a time.', 'Tu aviso est\xE1 aqu\xED. Revisemos qu\xE9 solicita, paso a paso.')}</p></div><div class="button-row"><button class="button gold" data-action="${next.reviewed ? 'nav' : 'review'}" ${next.reviewed ? 'data-page="plan"' : `data-id="${e(next.id)}"`}>${t(next.reviewed ? 'Open my action plan' : 'Review my notice', next.reviewed ? 'Abrir mi plan' : 'Revisar mi aviso')}${icon('arrow', 14)}</button><button class="plain-link" data-action="nav" data-page="about">${t('How it works', 'C\xF3mo funciona')}</button></div>${illustration()}</section><section class="panel deadline-panel"><div class="deadline-title">${t('On the horizon', 'Lo que viene')}${icon('calendar', 17)}</div>${soon ? `<div class="calendar-large"><div class="calendar-date"><small>${month(soon.date)}</small><strong>${Number(soon.date.slice(-2))}</strong></div><div><h3>${label(soon)}</h3><p>${days < 0 ? t(`${Math.abs(days)} days past date`, `${Math.abs(days)} d\xEDas despu\xE9s`) : days === 0 ? t('Date is today', 'La fecha es hoy') : t(`In ${days} days`, `En ${days} d\xEDas`)}${state.mode === 'demo' ? t(' \xB7 sample clock', ' \xB7 fecha de pr\xE1ctica') : ''}</p></div></div><p class="deadline-detail">${soon.confirmed ? t('You checked this date against your letter. Add it to your calendar so it stays in view.', 'Verificaste esta fecha en tu aviso. Puedes agregarla al calendario.') : t('This date was found in your letter. Check the original before relying on it.', 'Esta fecha se encontr\xF3 en el aviso. Verifica el original antes de usarla.')}</p><div class="deadline-footer"><span class="tag ${soon.confirmed ? 'green' : 'amber'}">${soon.confirmed ? icon('check', 10) : icon('eye', 10)}${soon.confirmed ? t('Checked by you', 'Verificada por ti') : t('Check the date', 'Verificar fecha')}</span><button class="link-button" data-action="${soon.confirmed ? 'calendar-preview' : 'source'}" data-id="${e(soon.notice.id)}" data-line="${soon.line || 1}">${soon.confirmed ? t('Save to calendar', 'Guardar en calendario') : t('Check source', 'Ver el original')}${icon('arrow', 12)}</button></div>` : `<div class="empty-state" style="padding:25px 0"><p>${t('No readable dates yet. Open the notice and check it with a trusted helper.', 'No hay fechas legibles. Revisa el aviso con alguien de confianza.')}</p></div>`}</section></div><div class="dashboard-middle"><section class="panel"><div class="panel-head"><h2>${t('Your letters, together', 'Tus avisos, juntos')}</h2><button class="link-button" data-action="nav" data-page="notices">${t('View all', 'Ver todos')}${icon('arrow', 12)}</button></div><div class="panel-body">${notices.slice(0, 2).map(noticeRow).join('')}<p class="hint">${icon('link', 10)} ${t('Every next step links back to the letter it came from.', 'Cada paso est\xE1 vinculado al aviso del que proviene.')}</p></div></section><section class="panel"><div class="panel-head"><h2>${t('Small steps. Real progress.', 'Peque\xF1os pasos. Progreso real.')}</h2><span class="tag gray">${completed()}/${all.length}</span></div><div class="panel-body"><div class="task-progress" role="progressbar" aria-valuenow="${progress()}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('Preparation progress', 'Progreso de preparaci\xF3n')}"><span style="width:${progress()}%"></span></div>${all.slice(0, 3).map(taskLine).join('')}${!all.length ? `<p class="hint">${t('Review your notice to identify the next steps.', 'Revisa tu aviso para identificar los siguientes pasos.')}</p>` : ''}<button class="link-button gap-top" data-action="nav" data-page="plan">${t('See my full plan', 'Ver mi plan completo')}${icon('arrow', 12)}</button></div></section></div><section class="journey-strip"><div class="journey-icon">${icon('heart', 22)}</div><div class="journey-copy"><h3>${t('You don\u2019t have to figure it out alone.', 'No tienes que resolverlo sin ayuda.')}</h3><p>${t('Take a clear summary to your county worker or a trusted benefits navigator.', 'Lleva un resumen claro a tu trabajador del condado o a un asesor de beneficios.')}</p></div><button class="button" data-action="handoff">${icon('download', 13)}${t('Make a handoff', 'Crear un resumen')}${icon('arrow', 12)}</button></section>`
  );
}
function noticeList() {
  const ns = workspace().notices;
  return (
    head(
      t('Every letter.<br>One clear picture.', 'Cada aviso.<br>Un panorama claro.'),
      t(
        'Keep the original wording close. See exactly where your next steps come from.',
        'Conserva el texto original y consulta de d\xF3nde proviene cada paso.',
      ),
      t('MY NOTICES', 'MIS AVISOS'),
    ) +
    (!ns.length
      ? empty(
          t('Your notices will live here.', 'Aqu\xED estar\xE1n tus avisos.'),
          t(
            'Add a PDF, photo, or text notice. Anchor reads it on this device.',
            'Agrega un PDF, una foto o el texto de un aviso. Anchor lo lee en este dispositivo.',
          ),
        )
      : `<div class="metric-row"><div class="panel metric"><span>${t('NOTICES SAVED', 'AVISOS GUARDADOS')}</span><strong>${ns.length}</strong><small>${t('Together in your workspace', 'Juntos en tu espacio')}</small></div><div class="panel metric"><span>${t('DATES TO CHECK', 'FECHAS POR VERIFICAR')}</span><strong>${ns.flatMap((n) => n.deadlines).filter((d) => !d.confirmed).length}</strong><small>${t('Against the original letter', 'En el aviso original')}</small></div><div class="panel metric"><span>${t('PLANS REVIEWED', 'PLANES REVISADOS')}</span><strong>${ns.filter((n) => n.reviewed).length}</strong><small>${t('Checked by you', 'Verificados por ti')}</small></div></div><div class="notice-grid">${ns.map((n) => `<article class="panel notice-card">${thumb()}<div>${statusTag(n)}<h3>${e(n.title)}</h3><p>${e(n.formCode || t('Unrecognized form', 'Formulario no reconocido'))} \xB7 ${e(COUNTIES[n.county]?.name || t('County not identified', 'Condado no identificado'))}</p><p>${t('Notice date', 'Fecha del aviso')}: ${n.noticeDate ? fmt(n.noticeDate) : t('Not identified', 'No identificada')}</p><div class="button-row"><button class="button light small" data-action="review" data-id="${e(n.id)}">${t('Open notice', 'Abrir aviso')}${icon('arrow', 12)}</button><button class="link-button" data-action="download-notice" data-id="${e(n.id)}" aria-label="${e(t('Download original text for ', 'Descargar texto de ') + n.title)}">${icon('download', 14)}</button></div>${n.isDemo ? `<p class="read-only-note">${t('Fictional practice correspondence', 'Correspondencia ficticia de pr\xE1ctica')}</p>` : ''}</div></article>`).join('')}</div>`)
  );
}
function review() {
  const n = noticeById(selected);
  if (!n) return noticeList();
  const competing = hasCompetingDates(n);
  const datesOK = planReady(n);
  return (
    `<button class="back-link" data-action="nav" data-page="notices">${icon('back', 13)}${t('All notices', 'Todos los avisos')}</button>` +
    head(
      e(n.title),
      t(
        'Check the letter. Confirm what it asks. Keep the next step clear.',
        'Revisa el aviso. Verifica lo que pide y organiza el siguiente paso.',
      ),
      n.isDemo
        ? t('FICTIONAL PRACTICE NOTICE', 'AVISO FICTICIO DE PR\xC1CTICA')
        : t('REVIEW YOUR NOTICE', 'REVISA TU AVISO'),
      false,
    ) +
    `<div class="review-layout"><section class="panel source-panel"><div class="source-toolbar"><span>${icon('file', 12)} ${e(n.filename)}</span><button class="link-button" data-action="download-notice" data-id="${e(n.id)}">${icon('download', 12)}${t('Save text', 'Guardar texto')}</button></div><div class="source-highlight-note ${highlightLine ? '' : 'hidden'}">${icon('link', 12)}${t('Here\u2019s the exact wording behind this step.', 'Este es el texto original de este paso.')}<button data-action="clear-highlight">${t('Clear', 'Quitar')}</button></div><div class="paper-wrap"><div class="source-paper">${n.sourceText
      .split(/\r\n|\n|\r/)
      .map(
        (line, i) =>
          `<div class="source-line ${highlightLine === i + 1 ? 'highlight' : ''}" id="line-${i + 1}"><span class="line-num" aria-hidden="true">${i + 1}</span><span>${e(line) || ' '}</span></div>`,
      )
      .join(
        '',
      )}</div></div><div class="source-bottom">${icon('lock', 11)} ${t('Original wording is preserved. If OCR missed something, use the original file to check it.', 'Se conserva el texto original. Si el reconocimiento omiti\xF3 algo, consulta el archivo original.')}${n.originalAttachmentId ? ` <button class="link-button" data-action="attachment" data-attachment="${e(n.originalAttachmentId)}">${t('Download original file', 'Descargar archivo original')}</button>` : ''}</div></section><div class="review-stack">${!n.supported ? `<div class="review-warning">${icon('warning', 18)}<div><strong>${t('This notice needs a person\u2019s review.', 'Este aviso requiere revisi\xF3n humana.')}</strong><p>${t('Anchor could not confidently recognize a supported CalFresh notice. Take the original to your county or a trusted navigator.', 'Anchor no reconoci\xF3 un aviso de CalFresh compatible. Lleva el original al condado o a un asesor.')}</p></div></div>` : ''}<section class="panel review-card"><div class="eyebrow">${t('01 \xB7 DATES, KEPT DISTINCT', '01 \xB7 FECHAS POR SEPARADO')}</div><h2>${t('What\u2019s coming up', 'Lo que viene')}</h2><p>${t('A submission date and the end of benefits are different. Check each one in the letter.', 'La fecha de env\xEDo y el fin de beneficios son distintos. Verifica cada fecha en el aviso.')}</p>${n.deadlines.length ? n.deadlines.map((d) => `<div class="fact"><div class="fact-head"><span class="fact-title">${label(d)}</span><span class="tag ${d.excluded ? 'gray' : d.confirmed ? 'green' : 'amber'}">${d.excluded ? t('Does not apply', 'No corresponde') : d.confirmed ? t('Checked', 'Verificada') : d.needsReview ? t('Needs clarification', 'Requiere aclaraci\xF3n') : t('Check original', 'Verificar original')}</span></div><div class="fact-date">${d.date ? fmt(d.date) : e(d.raw)}</div><button class="link-button" data-action="source" data-id="${e(n.id)}" data-line="${d.line}">${icon('link', 11)}${t('Show in the letter', 'Mostrar en el aviso')}</button><blockquote>${e(d.quote)}</blockquote><button class="link-button" data-action="edit-date" data-id="${e(n.id)}" data-date="${e(d.id)}">${t('Correct this date', 'Corregir esta fecha')}</button>${d.needsReview || d.editing ? `<label class="hint" for="date-${e(d.id)}">${t('Enter the date you verified in the original or with the county.', 'Ingresa la fecha que verificaste en el original o con el condado.')}</label><div><input class="date-input" id="date-${e(d.id)}" type="date" data-notice="${e(n.id)}" data-date="${e(d.id)}" value="${e(d.date || '')}" aria-label="${e(label(d))}"></div>` : ''}<label class="confirm-label"><input type="checkbox" data-confirm="${e(d.id)}" data-notice="${e(n.id)}" ${d.confirmed ? 'checked' : ''} ${!d.date ? 'disabled' : ''}>${d.needsReview ? t('I confirmed this date and resolved the ambiguity.', 'Confirm\xE9 esta fecha y aclar\xE9 la ambig\xFCedad.') : t('I checked this date against the original notice.', 'Verifiqu\xE9 esta fecha en el aviso original.')}</label>${competing ? `<label class="confirm-label"><input type="checkbox" data-exclude="${e(d.id)}" data-notice="${e(n.id)}" ${d.excluded ? 'checked' : ''}>${t('This date does not apply, after clarification.', 'Esta fecha no corresponde, despu\xE9s de aclararlo.')}</label>` : ''}${d.userEntered ? `<p class="hint">${t('Date corrected by you; original wording is preserved above.', 'Fecha corregida por ti; se conserva el texto original arriba.')}</p>` : ''}</div>`).join('') : `<p class="hint">${t('No explicit, readable dates were identified. Ask your county to clarify any timing.', 'No se identificaron fechas expl\xEDcitas y legibles. Consulta el plazo con el condado.')}</p>`}${competing ? `<div class="review-warning gap-top">${icon('warning', 16)}<div><strong>${t('Competing dates need clarification.', 'Las fechas contradictorias requieren aclaraci\xF3n.')}</strong><p>${t('Keep both original dates visible. Ask the county which applies, then record the clarification before using or exporting the plan.', 'Conserva ambas fechas originales. Consulta al condado cu\xE1l corresponde y registra la aclaraci\xF3n antes de usar o exportar el plan.')}</p></div></div><label class="hint" for="clarification">${t('What did you clarify, and how?', '\xBFQu\xE9 aclaraste y c\xF3mo?')}</label><textarea id="clarification" class="clarify-text" data-clarify="${e(n.id)}" maxlength="2000" placeholder="${t('e.g. County worker clarified the applicable date on\u2026', 'p. ej. El trabajador del condado aclar\xF3 la fecha el\u2026')}">${e(n.clarification || '')}</textarea>` : ''}</section><section class="panel review-card"><div class="eyebrow">${t('02 \xB7 WHAT THE LETTER ASKS', '02 \xB7 LO QUE PIDE EL AVISO')}</div><h2>${t('Your next steps', 'Tus siguientes pasos')}</h2>${n.requests.length ? n.requests.map((r) => `<div class="request-item">${icon(r.kind === 'document' ? 'folder' : r.kind === 'interview' ? 'phone' : 'file', 17)}<div><strong>${e(r.title)}</strong><p>${e(r.description)}</p><button class="link-button" data-action="source" data-id="${e(n.id)}" data-line="${r.line}">${t('Check the source', 'Verificar el original')}${icon('link', 11)}</button><div class="task-assist-actions"><button class="button light small" data-action="form-open" data-id="${e(n.id)}" data-task="${e(r.id)}">${t('Prepare with a guide', 'Preparar con una guía')}${icon('arrow', 12)}</button></div></div></div>`).join('') : `<p class="hint">${t('No definite requests could be read. Unmarked checkboxes are not counted as requests.', 'No se pudieron leer solicitudes claras. Las casillas sin marcar no se cuentan como solicitudes.')}</p><button class="button light small" data-action="form-open" data-id="${e(n.id)}">${t('Prepare with a guide', 'Preparar con una guía')}</button>`}${n.warnings.length ? `<div class="review-warning gap-top">${icon('eye', 17)}<div><strong>${t('A little more attention needed', 'Se necesita un poco m\xE1s de atenci\xF3n')}</strong><ul class="warning-list">${n.warnings.map((w) => `<li>${e(w)}</li>`).join('')}</ul></div></div>` : ''}<div class="review-actions"><button class="button" data-action="confirm-plan" data-id="${e(n.id)}" ${!n.supported || !datesOK ? 'disabled' : ''}>${icon('check', 14)}${t('Use this action plan', 'Usar este plan')}</button><button class="button light" data-action="nav" data-page="support">${t('Ask for help', 'Pedir ayuda')}</button></div><p class="hint">${t('Confirm each date above before using the plan. Reviewing a plan does not submit anything to the county.', 'Verifica cada fecha antes de usar el plan. Revisarlo no env\xEDa nada al condado.')}</p></section></div></div>`
  );
}
function actionPlan() {
  const ns = workspace().notices;
  if (!ns.length)
    return (
      head(
        t('One step at a time.', 'Paso a paso.'),
        t(
          'A manageable plan, anchored to your original letters.',
          'Un plan organizado a partir de los avisos originales.',
        ),
        t('ACTION PLAN', 'PLAN DE ACCI\xD3N'),
      ) +
      empty(
        t('Let\u2019s find your next step.', 'Encontremos tu siguiente paso.'),
        t(
          'Add and review a letter to create a source-linked plan.',
          'Agrega y revisa un aviso para crear un plan con fuentes.',
        ),
      )
    );
  const all = requests(),
    conflicts = reconcileNotices(ns),
    done = completed();
  return (
    head(
      t('One step at a time.', 'Paso a paso.'),
      t(
        'Prepare what\u2019s requested. Keep proof of what you send.',
        'Prepara lo solicitado. Conserva pruebas de lo que env\xEDes.',
      ),
      t('ACTION PLAN', 'PLAN DE ACCI\xD3N'),
    ) +
    conflicts
      .map(
        (c) =>
          `<div class="conflict-card">${icon('warning', 19)}<div><h3>${e(c.title)}</h3><p>${e(c.description)}</p><button class="link-button" data-action="review" data-id="${e(c.noticeIds?.[0] || ns[0].id)}">${t('Compare with the original', 'Comparar con el original')}${icon('arrow', 12)}</button></div></div>`,
      )
      .join('') +
    `<div class="document-layout"><section class="panel tasks-panel"><div class="panel-head"><h2>${t('Your preparation checklist', 'Tu lista de preparaci\xF3n')}</h2><span class="tag green">${done}/${all.length} ${t('prepared', 'preparados')}</span></div><div class="panel-body"><div class="progress-info"><span>${t('Small steps add up.', 'Los peque\xF1os pasos cuentan.')}</span><span>${progress()}%</span></div><div class="task-progress"><span style="width:${progress()}%"></span></div>${all.map(taskLine).join('')}${!all.length ? `<p class="hint">${t('Open the notice and ask a navigator to help identify its requests.', 'Abre el aviso y pide ayuda para identificar sus solicitudes.')}</p>` : ''}<div class="review-warning gap-top">${icon('info', 16)}<span>${t('A checkmark means you prepared the item. Keep a submission record separately; the county determines whether it is accepted.', 'Una marca indica que preparaste el documento. Guarda un registro de env\xEDo por separado; el condado decide si lo acepta.')}</span></div><div class="button-row gap-top"><button class="button" data-action="receipt">${icon('plus', 13)}${t('Record a submission', 'Registrar un env\xEDo')}</button><button class="button light" data-action="nav" data-page="calendar">${icon('calendar', 14)}${t('Google Calendar', 'Google Calendar')}</button><button class="button light" data-action="calendar-all">${icon('calendar', 14)}${t('Export checked dates', 'Exportar fechas verificadas')}</button></div></div></section><aside class="panel stepper"><h3>${t('From letter to follow-through', 'Del aviso al seguimiento')}</h3>${[
      [
        t('Understand the letter', 'Entender el aviso'),
        t('Check the exact dates and requests.', 'Verifica las fechas y solicitudes.'),
        ns.every((n) => n.reviewed),
      ],
      [
        t('Prepare your next steps', 'Preparar los siguientes pasos'),
        t(
          'Use the requested evidence or ask about alternatives.',
          'Usa las pruebas solicitadas o pregunta por alternativas.',
        ),
        all.length && done === all.length,
      ],
      [
        t('Submit through the county', 'Enviar al condado'),
        t(
          'Use the official channel. Save the confirmation.',
          'Usa el canal oficial. Guarda la confirmaci\xF3n.',
        ),
        workspace().events.some((ev) => ev.kind === 'submitted'),
      ],
      [
        t('Follow up', 'Dar seguimiento'),
        t(
          'Check with your worker if anything is still unclear.',
          'Consulta a tu trabajador si algo sigue sin aclararse.',
        ),
        false,
      ],
    ]
      .map(
        ([title, desc, active], i) =>
          `<div class="step ${active ? 'active' : ''}"><span class="step-number">${active ? icon('check', 12) : i + 1}</span><div><h3>${title}</h3><p>${desc}</p></div></div>`,
      )
      .join(
        '',
      )}<button class="button light full-width" data-action="handoff">${icon('download', 13)}${t('Make a handoff', 'Crear un resumen')}</button></aside></div>`
  );
}
function evidence() {
  const evs = workspace().events.filter((ev) =>
    ['submitted', 'note', 'receipt', 'acknowledged', 'evidence-reused'].includes(ev.kind),
  );
  return (
    head(
      t('Keep the paper trail.', 'Conserva las pruebas.'),
      t(
        'What you sent, when you sent it, and the confirmation you saved.',
        'Qu\xE9 enviaste, cu\xE1ndo lo enviaste y qu\xE9 confirmaci\xF3n guardaste.',
      ),
      t('EVIDENCE & RECEIPTS', 'PRUEBAS Y RECIBOS'),
    ) +
    `<div class="document-layout"><section class="panel"><div class="panel-head"><h2>${t('Your submission records', 'Tus registros de env\xEDo')}</h2><button class="link-button" data-action="receipt">${icon('plus', 13)}${t('Add a record', 'Agregar registro')}</button></div>${evs.length ? evs.map((ev) => `<div class="evidence-row"><span class="evidence-icon">${icon(ev.attachmentId ? 'file' : 'folder', 19)}</span><div class="evidence-info"><h3>${e(ev.title)}</h3><p>${e(noticeById(ev.noticeId)?.title || '')} \xB7 ${e(new Date(ev.date).toLocaleDateString(state.lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</p>${ev.detail ? `<p>${e(ev.detail)}</p>` : ''}<span class="tag gray">${t('Recorded by you', 'Registrado por ti')}</span>${ev.filename ? `<p style="margin-top:8px">${e(ev.filename)}</p>` : ''}</div>${ev.attachmentId ? `<button class="link-button" data-action="attachment" data-attachment="${e(ev.attachmentId)}" aria-label="${e(t('Download ', 'Descargar ') + (ev.filename || ev.title))}">${icon('download', 15)}</button>` : ''}</div>`).join('') : `<div class="empty-state" style="padding:32px 24px">${icon('folder', 30)}<h2 style="font-size:20px">${t('A place for your peace of mind.', 'Un lugar para tu tranquilidad.')}</h2><p>${t('After submitting through an official channel, keep your receipt or reference here.', 'Despu\xE9s de enviar por un canal oficial, guarda aqu\xED el recibo o n\xFAmero de referencia.')}</p><button class="button light" data-action="receipt">${icon('plus', 13)}${t('Add a submission record', 'Agregar registro de env\xEDo')}</button></div>`}<div class="panel-body"><p class="hint">${t('Your record shows what you entered. It does not independently verify delivery, approval, or benefit status.', 'El registro muestra lo que ingresaste. No verifica por s\xED mismo la entrega, aprobaci\xF3n ni el estado de beneficios.')}</p><button class="button light full-width gap-top" data-action="handoff">${icon('download', 14)}${t('Make a navigator handoff', 'Crear un resumen para un asesor')}</button></div></section><section class="panel timeline-panel"><div class="panel-head"><h2>${t('Your journey so far', 'Tu recorrido hasta ahora')}</h2>${icon('clock', 16)}</div><div class="panel-body">${
      workspace().events.length
        ? workspace()
            .events.slice(0, 8)
            .map(
              (ev) =>
                `<div class="timeline-event"><span class="event-dot">${icon(ev.kind === 'prepared' ? 'check' : ev.kind === 'submitted' ? 'upload' : 'file', 12)}</span><div><h3>${e(ev.title)}</h3><p>${e(new Date(ev.date).toLocaleString(state.lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</p>${ev.noticeId ? `<button class="link-button" data-action="review" data-id="${e(ev.noticeId)}">${t('Open related notice', 'Abrir aviso relacionado')}${icon('arrow', 11)}</button>` : ''}</div></div>`,
            )
            .join('')
        : `<p class="body-text">${t('Your reviews, preparation, and submission records will appear here as you go.', 'Aqu\xED aparecer\xE1n tus revisiones, preparaci\xF3n y registros de env\xEDo.')}</p>`
    }</div></section></div>`
  );
}
function support() {
  const c = COUNTIES[state.county];
  return (
    head(
      t('A real person.<br>A clearer answer.', 'Una persona real.<br>Una respuesta m\xE1s clara.'),
      t(
        'Bring your original notice and a simple summary of what you need to ask.',
        'Lleva tu aviso original y un resumen de lo que necesitas preguntar.',
      ),
      t('GET SUPPORT', 'OBTENER AYUDA'),
      false,
    ) +
    `<label class="select-wrap">${t('Show resources for', 'Mostrar recursos de')}<select id="county"><option value="santa-clara" ${state.county === 'santa-clara' ? 'selected' : ''}>Santa Clara County</option><option value="san-mateo" ${state.county === 'san-mateo' ? 'selected' : ''}>San Mateo County</option></select></label><div class="support-grid"><section class="panel support-card">${icon('phone', 28)}<h2>${t('Start with your county.', 'Empieza por tu condado.')}</h2><p>${t('If your letter lists a worker\u2019s number, start there. Otherwise, these official contact details can help.', 'Si tu aviso incluye el tel\xE9fono de un trabajador, empieza all\xED. Estos datos oficiales tambi\xE9n pueden ayudarte.')}</p><div class="contact-detail"><span>${e(c.name)}</span><a href="${e(c.phoneHref)}">${e(c.phone)}</a></div><div class="contact-detail"><span>${t('Published hours', 'Horario publicado')}</span>${e(c.hours)}</div><div class="contact-detail"><span>${t('Office', 'Oficina')}</span>${e(c.address)}</div>${ext(c.helpUrl, t('County contact options', 'Opciones de contacto'))}<p class="hint">${t('You can ask for language assistance or an accommodation. Confirm office availability before traveling.', 'Puedes solicitar ayuda con el idioma o una adaptaci\xF3n. Verifica la disponibilidad antes de viajar.')}</p></section><section class="panel support-card">${icon('globe', 28)}<h2>${t('Use the official channel.', 'Usa el canal oficial.')}</h2><p>${t('BenefitsCal is the official portal for applying, renewing, and managing supported California benefits. Sign in there to submit or check your case.', 'BenefitsCal es el portal oficial para solicitar, renovar y administrar beneficios compatibles de California. Inicia sesi\xF3n all\xED para enviar documentos o revisar tu caso.')}</p>${ext(c.applyUrl, t('Open BenefitsCal', 'Abrir BenefitsCal'), 'button')}<div class="source-info gap-top">${t('Need help explaining the situation? Download a summary of your notices, checked dates, outstanding requests, and submission records.', '\xBFNecesitas explicar la situaci\xF3n? Descarga un resumen de avisos, fechas verificadas, solicitudes pendientes y registros de env\xEDo.')}</div><button class="button light full-width gap-top" data-action="handoff">${icon('download', 14)}${t('Create a navigator handoff', 'Crear un resumen para un asesor')}</button></section></div><section class="panel sources-panel"><h2>${t('Clear steps start with reliable sources.', 'Los pasos claros empiezan con fuentes confiables.')}</h2><p class="body-text" style="margin-bottom:15px">${t('Official resources behind this prototype. Your own notice remains the source for your case-specific requests.', 'Recursos oficiales de este prototipo. Tu propio aviso sigue siendo la fuente de las solicitudes de tu caso.')}</p>${SOURCES.map((s) => `<div class="source-resource">${icon('link', 15)}<div><strong>${e(s.title)}</strong><p>${e(s.description)}</p><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${t('View official source', 'Ver fuente oficial')}${icon('external', 10)}</a><small>${t('Checked', 'Consultado')} ${e(s.checkedAt)}</small></div></div>`).join('')}</section>`
  );
}
function about() {
  return (
    head(
      t('Clarity you can<br>trace back.', 'Claridad que puedes<br>verificar.'),
      t(
        'Built around the letter, the person, and the next useful step.',
        'Creado en torno al aviso, la persona y el siguiente paso \xFAtil.',
      ),
      t('ABOUT ANCHOR', 'ACERCA DE ANCHOR'),
      false,
    ) +
    `<section class="panel about-hero"><div class="eyebrow">${t('WHY ANCHOR EXISTS', 'POR QU\xC9 EXISTE ANCHOR')}</div><h2>${t('Essential support shouldn\u2019t get lost in the paperwork.', 'El apoyo esencial no deber\xEDa perderse entre papeles.')}</h2><p>${t('Anchor helps you understand a benefit letter, check its dates and requests, prepare your next steps, and preserve a record of what you send. Every extracted step has a connection to the original text.', 'Anchor te ayuda a entender un aviso de beneficios, verificar sus fechas y solicitudes, preparar los siguientes pasos y conservar un registro de lo que env\xEDas. Cada paso identificado se vincula con el texto original.')}</p></section><div class="about-grid"><section class="panel about-card">${icon('eye', 24)}<h3>${t('See where it came from.', 'Consulta de d\xF3nde proviene.')}</h3><p>${t('A date or task links to its exact line in the letter. Uncertainty stays visible until you resolve it.', 'Cada fecha o tarea se vincula a una l\xEDnea del aviso. La incertidumbre queda visible hasta que la aclares.')}</p></section><section class="panel about-card">${icon('lock', 24)}<h3>${t('Stay in control.', 'Mant\xE9n el control.')}</h3><p>${t('PDFs and images are read locally. Sign in to save letters, progress, originals, and receipts privately to your account. Guest records stay on this device.', 'Los PDFs e imágenes se leen localmente. Inicia sesión para guardar avisos, progreso, originales y recibos en tu cuenta privada. Los datos de invitado quedan aquí.')}</p></section><section class="panel about-card">${icon('heart', 24)}<h3>${t('Get a human answer.', 'Obt\xE9n una respuesta humana.')}</h3><p>${t('Make a handoff with the original wording, questions, and submission records. A county worker can help clarify what the app cannot.', 'Crea un resumen con el texto original, preguntas y registros de env\xEDo. Un trabajador del condado puede aclarar lo que la aplicaci\xF3n no puede.')}</p></section></div><section class="panel settings-list"><h2 style="font-size:18px;margin-bottom:5px">${t('Your workspace, your choice.', 'Tu espacio, tu decisi\xF3n.')}</h2><div class="setting"><div><h3>${t('Practice with fictional notices', 'Practicar con avisos ficticios')}</h3><p>${t('Explore the full workflow in a separate sample workspace. Dates in the sample use an October 9, 2026 reference clock.', 'Explora todo el proceso en un espacio de pr\xE1ctica separado. Las fechas de pr\xE1ctica usan el 9 de octubre de 2026 como referencia.')}</p></div><button class="button light small" data-action="switch-mode">${state.mode === 'demo' ? t('Go to my workspace', 'Ir a mi espacio') : t('Explore the sample', 'Explorar el ejemplo')}</button></div><div class="setting"><div><h3>${t('Take a copy with you', 'Conservar una copia')}</h3><p>${t('Download your workspace text and progress as a JSON backup. Receipt files are separate; download important originals too.', 'Descarga el texto y progreso como copia JSON. Los recibos se guardan por separado; descarga tambi\xE9n los originales importantes.')}</p></div><button class="button light small" data-action="backup">${icon('download', 13)}${t('Download backup', 'Descargar copia')}</button></div><div class="setting"><div><h3>${t('Read the processing boundaries', 'Consultar los l\xEDmites')}</h3><p>${t('This prototype recognizes English CalFresh renewal and verification correspondence. It does not determine eligibility or submit applications.', 'Este prototipo reconoce correspondencia de renovaci\xF3n y verificaci\xF3n de CalFresh en ingl\xE9s. No determina elegibilidad ni env\xEDa solicitudes.')}</p></div><button class="button light small" data-action="privacy">${t('Privacy & scope', 'Privacidad y alcance')}</button></div><div class="setting"><div><h3>${t('Remove saved information', 'Eliminar informaci\xF3n guardada')}</h3><p>${t('Reset practice, clear guest data on this device, or delete your signed-in personal workspace. Download important records first.', 'Reinicia la práctica, borra datos locales de invitado o elimina tu espacio personal con sesión iniciada. Descarga primero lo importante.')}</p></div><button class="button light small" data-action="clear-data">${icon('trash', 13)}${t('Manage saved data', 'Administrar datos')}</button></div></section>`
  );
}
function render({ captureAssistant = true } = {}) {
  // A storage/status update must not replace a clarification mid-edit. Keep
  // the existing input and its draft/caret until blur commits it. Navigating
  // or restoring another workspace clears selected, so this cannot retain an
  // editor across account or notice boundaries.
  const clarification = $('#clarification');
  if (
    clarification &&
    page === 'notices' &&
    selected === clarification.dataset.clarify &&
    (document.activeElement === clarification || pointerDown)
  ) {
    clarificationRenderDeferred = true;
    return;
  }
  clarificationRenderDeferred = false;
  if (captureAssistant) assistant.capture();
  const focusTarget = captureFocus();
  document.documentElement.lang = state.lang;
  const content =
    page === 'overview'
      ? overview()
      : page === 'notices'
        ? selected
          ? review()
          : noticeList()
        : page === 'plan'
          ? actionPlan()
          : page === 'evidence'
            ? evidence()
            : page === 'continuity'
              ? renderContinuity({
                  workspace: workspace(),
                  lang: state.lang,
                  today: refToday(),
                  capacityMinutes: continuityCapacity,
                })
              : page === 'forms'
                ? formsPage()
                : page === 'calendar'
                  ? calendarPage()
                  : page === 'assistant'
                    ? assistant.view()
                    : page === 'support'
                      ? support()
                      : about();
  app.innerHTML = shell(content);
  guide?.refresh();
  updateNextStep();
  if (page === 'calendar') prepareCalendar();
  if (focusTarget)
    requestAnimationFrame(() => {
      // Do not steal focus if the resident already moved to another control.
      if (document.activeElement === document.body) $(focusTarget)?.focus({ preventScroll: true });
    });
  if (highlightLine && selected)
    requestAnimationFrame(() =>
      $(`#line-${highlightLine}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
}
function navigate(p) {
  page = p;
  selected = null;
  highlightLine = null;
  navOpen = false;
  history.replaceState(null, '', '#' + p);
  render();
  $('#main')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function openReview(id, line = null) {
  if (!noticeById(id)) return;
  page = 'notices';
  selected = id;
  highlightLine = line;
  navOpen = false;
  render();
  $('#main')?.focus({ preventScroll: true });
  if (!line) window.scrollTo({ top: 0, behavior: 'instant' });
}
function modalHead(title, sub = '') {
  return `<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="close-button" data-action="close-modal" aria-label="${t('Close', 'Cerrar')}">${icon('close', 14)}</button></div>`;
}
function showModal(html, wide = false) {
  modal.removeAttribute('data-account');
  modal.classList.toggle('wide-modal', wide);
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
}
function importModal() {
  busy = false;
  showModal(
    modalHead(
      t('A little clarity starts here.', 'Aqu\xED empieza un poco de claridad.'),
      t(
        'Add a notice. We\u2019ll help you check the next step.',
        'Agrega un aviso. Te ayudaremos a verificar el siguiente paso.',
      ),
    ) +
      `<div class="modal-body">${importError ? `<div class="error-message" role="alert">${e(importError)}</div>` : ''}<div class="tabs" role="group" aria-label="${t('Import method', 'M\xE9todo de importaci\xF3n')}">${['upload', 'paste', 'sample'].map((tab) => `<button aria-pressed="${importTab === tab}" class="${importTab === tab ? 'active' : ''}" data-action="import-tab" data-tab="${tab}">${tab === 'upload' ? t('Upload a file', 'Subir archivo') : tab === 'paste' ? t('Paste text', 'Pegar texto') : t('Try a sample', 'Probar ejemplo')}</button>`).join('')}</div>${importTab === 'upload' ? `<label class="drop-zone" id="drop-zone" for="notice-file">${icon('upload', 30)}<strong>${t('Drop your notice here', 'Suelta tu aviso aqu\xED')}</strong><p>${t('PDF, photo, or plain text \xB7 Up to 20 MB', 'PDF, foto o texto \xB7 Hasta 20 MB')}</p><button type="button" class="button" data-action="choose-file">${t('Choose from device', 'Elegir del dispositivo')}${icon('arrow', 12)}</button><input id="notice-file" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.bmp" hidden></label><p class="file-help">${t('English text recognition \xB7 Up to 10 PDF pages \xB7 Use a clear, straight photo.', 'Reconocimiento de texto en ingl\xE9s \xB7 Hasta 10 p\xE1ginas PDF \xB7 Usa una foto clara y recta.')}</p>` : importTab === 'paste' ? `<form id="paste-form"><div class="field"><label for="notice-name">${t('A name for this notice', 'Nombre de este aviso')}</label><input id="notice-name" name="name" maxlength="100" placeholder="${t('e.g. October CalFresh letter', 'p. ej. Aviso de CalFresh de octubre')}"></div><div class="field"><label for="notice-text">${t('Original notice text', 'Texto original del aviso')}</label><textarea id="notice-text" name="text" required maxlength="500000" placeholder="${t('Paste the complete notice, including dates and the form number\u2026', 'Pega el aviso completo, incluidas las fechas y el n\xFAmero de formulario\u2026')}"></textarea></div><button class="button full-width" type="submit">${t('Read this notice', 'Leer este aviso')}${icon('arrow', 14)}</button></form>` : DEMO_NOTICES.map((s) => `<div class="import-sample">${icon('file', 20)}<div><h3>${e(s.title)}</h3><p>${t('Fictional practice notice', 'Aviso ficticio de pr\xE1ctica')}</p></div><button class="button light small" data-action="add-sample" data-id="${e(s.id)}">${t('Try it', 'Probar')}${icon('arrow', 11)}</button><a class="link-button" href="./samples/${e(s.id)}.pdf" download="fictional-${e(s.id)}.pdf" aria-label="${e(t('Download practice PDF: ', 'Descargar PDF de práctica: ') + s.title)}">${icon('download', 14)}PDF</a></div>`).join('')}<div class="modal-note">${icon('lock', 13)}<span>${t('Your notice is read on this device. Signed-in personal files save privately to your account; guest files stay here. No notice is sent to an AI service.', 'Tu aviso se lee localmente. Los archivos personales guardados con sesión se guardan en tu cuenta; los de invitado quedan aquí. No se envían a servicios de IA.')}</span></div></div>`,
  );
}
function importProgress(p) {
  showModal(
    modalHead(t('Reading your notice locally', 'Leyendo el aviso localmente')) +
      `<div class="modal-body"><div class="import-progress"><div class="spinner" aria-hidden="true"></div><h3>${t('Reading the original on your device.', 'Leyendo el original en tu dispositivo.')}</h3><p role="status">${e(p.message || t('Finding the original text\u2026', 'Encontrando el texto original\u2026'))}</p><div class="task-progress" role="progressbar" aria-valuenow="${Math.round((p.progress || 0) * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('Import progress', 'Progreso de importaci\xF3n')}"><span style="width:${Math.round((p.progress || 0) * 100)}%"></span></div></div></div>`,
  );
}
async function addText(text, filename, options = {}) {
  if (!text.trim())
    throw new Error(
      t('Add some readable notice text first.', 'Primero agrega texto legible del aviso.'),
    );
  state.mode = options.isDemo ? 'demo' : 'personal';
  const n = analyzeNotice(text, { filename, county: 'unknown', isDemo: false, ...options });
  n.reviewed = false;
  workspace().notices.unshift(n);
  event('imported', t('Notice added', 'Aviso agregado'), n.id);
  await persist();
  modal.close();
  openReview(n.id);
  toast(
    t(
      'Notice added. Check the original before using its dates.',
      'Aviso agregado. Verifica el original antes de usar las fechas.',
    ),
  );
  return n;
}
async function importFile(file) {
  if (busy) return;
  busy = true;
  importError = '';
  try {
    importProgress({ progress: 0.01 });
    const result = await extractFile(file, importProgress);
    let attachmentId;
    try {
      attachmentId = await storeFile(file);
    } catch {
      toast(
        t(
          'Original file could not be saved. Keep your own copy.',
          'No se pudo guardar el original. Conserva una copia.',
        ),
      );
    }
    const n = await addText(result.text, file.name);
    n.originalAttachmentId = attachmentId;
    n.importKind = result.kind;
    n.ocr = result.ocr;
    if (result.ocr) {
      n.deadlines.forEach((d) => {
        d.needsReview = true;
        d.confirmed = false;
      });
      n.warnings.push(
        t(
          'This text came from image recognition. Compare it with the original image; check marks and characters may have been missed.',
          'Este texto proviene de reconocimiento de imagen. Comp\xE1ralo con el original; pueden faltar marcas o caracteres.',
        ),
      );
    }
    await persist();
    render();
  } catch (err) {
    importError = err.message;
    importTab = 'upload';
    importModal();
  } finally {
    busy = false;
  }
}
function receiptModal() {
  if (!workspace().notices.length) {
    toast(
      t(
        'Add a notice before recording a submission.',
        'Agrega un aviso antes de registrar un env\xEDo.',
      ),
    );
    return;
  }
  showModal(
    modalHead(
      t('Keep a record of what you sent.', 'Conserva un registro de lo que enviaste.'),
      t(
        'Record your own submission. Keep any confirmation with it.',
        'Registra tu env\xEDo y conserva su confirmaci\xF3n.',
      ),
    ) +
      `<div class="modal-body"><form id="receipt-form"><div class="field"><label for="receipt-notice">${t('Related notice', 'Aviso relacionado')}</label><select id="receipt-notice" name="notice">${workspace()
        .notices.map((n) => `<option value="${e(n.id)}">${e(n.title)}</option>`)
        .join(
          '',
        )}</select></div><div class="field-row"><div class="field"><label for="receipt-date">${t('Date you submitted', 'Fecha de env\xEDo')}</label><input id="receipt-date" name="date" type="date" required value="${/* @__PURE__ */ new Date().toLocaleDateString('en-CA')}"></div><div class="field"><label for="receipt-channel">${t('Channel you used', 'Canal utilizado')}</label><select id="receipt-channel" name="channel"><option>BenefitsCal</option><option>${t('County office', 'Oficina del condado')}</option><option>${t('Mail', 'Correo')}</option><option>${t('Fax', 'Fax')}</option><option>${t('Other official channel', 'Otro canal oficial')}</option></select></div></div><div class="field"><label for="receipt-note">${t('What you sent / reference number', 'Qu\xE9 enviaste / n\xFAmero de referencia')}</label><textarea style="min-height:85px" id="receipt-note" name="detail" maxlength="3000" placeholder="${t('e.g. Renewal form and September income proof. Confirmation: \u2026', 'p. ej. Formulario de renovaci\xF3n y comprobante de ingresos. Confirmaci\xF3n: \u2026')}" required></textarea></div><div class="field"><label for="receipt-file">${t('Receipt or confirmation (optional)', 'Recibo o confirmaci\xF3n (opcional)')}</label><input id="receipt-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"><p class="file-help">${t('Up to 20 MB. Stored only in this browser.', 'Hasta 20 MB. Se guarda solo en este navegador.')}</p></div><div class="review-warning">${icon('info', 15)}<span>${t('This is your record of sending something. The county decides whether it was received and accepted.', 'Este es tu registro de env\xEDo. El condado decide si lo recibi\xF3 y acept\xF3.')}</span></div><button class="button full-width gap-top" type="submit">${icon('check', 14)}${t('Save my submission record', 'Guardar mi registro de env\xEDo')}</button></form></div>`,
  );
}
function handoffText() {
  return buildHandoff(workspace().notices, workspace().events, COUNTIES[state.county], state.lang);
}
function handoffModal() {
  showModal(
    modalHead(
      t('A clearer conversation starts here.', 'Aqu\xED empieza una conversaci\xF3n m\xE1s clara.'),
      t(
        'Take this summary to a trusted navigator or your county worker.',
        'Lleva este resumen a un asesor de confianza o a tu trabajador del condado.',
      ),
    ) +
      `<div class="modal-body"><div class="source-info">${t('Includes original requests, dates and their confirmation status, preparation progress, and your submission records. Review it before sharing; it may contain personal information from your notices.', 'Incluye solicitudes originales, fechas y su estado de verificaci\xF3n, progreso y registros de env\xEDo. Rev\xEDsalo antes de compartir; puede contener informaci\xF3n personal.')}</div><div class="field gap-top"><label for="handoff-preview">${t('Your handoff preview', 'Vista previa del resumen')}</label><textarea id="handoff-preview" readonly style="min-height:300px"></textarea></div><div class="button-row"><button class="button" data-action="download-handoff">${icon('download', 14)}${t('Download summary', 'Descargar resumen')}</button><button class="button light" data-action="print-handoff">${icon('print', 14)}${t('Print', 'Imprimir')}</button></div></div>`,
    true,
  );
  $('#handoff-preview').value = handoffText();
}
function privacyModal() {
  showModal(
    modalHead(t('Your information stays yours.', 'Tu informaci\xF3n te pertenece.')) +
      `<div class="modal-body body-text"><p>${t('Anchor reads your PDFs and English-language images on your device. It does not send notice content to an AI service, analytics provider, or document-processing server. Its PDF reader and OCR files are served from the same site.', 'Anchor lee PDFs e im\xE1genes en ingl\xE9s en tu dispositivo. No env\xEDa los avisos a un servicio de IA, proveedor de an\xE1lisis ni servidor de procesamiento. Sus archivos de lectura PDF y OCR provienen del mismo sitio.')}</p><p>${t('Guest notices and files stay in this browser. When signed in, personal notices, originals, progress, and receipts save to your private Anchor account. A local account copy supports offline work; pending changes must reconnect before they reach other devices. Sign out after saving to clear that account’s local copy. Keep important originals and confirmations separately.', 'Los avisos y archivos de invitado quedan en este navegador. Con sesión iniciada, los avisos personales, originales, progreso y recibos se guardan en tu cuenta privada de Anchor. La copia local permite trabajar sin conexión; los cambios pendientes necesitan conexión para llegar a otros dispositivos. Cierra sesión después de guardar para borrar la copia local de esa cuenta. Conserva tus originales importantes.')}</p><p>${t('Saved pages work offline after the first visit. The larger PDF/OCR readers must be prepared once while connected before offline file imports. Choose a calendar file or optionally connect Google Calendar to add selected reminders.', 'Las p\xE1ginas guardadas funcionan sin conexi\xF3n despu\xE9s de la primera visita. Los lectores PDF/OCR deben prepararse con conexi\xF3n antes de importar archivos sin conexi\xF3n. No hay notificaciones en segundo plano; exportas las fechas a tu calendario.')}</p><p>${t('This is a focused prototype for English CalFresh renewal and verification notice families. It flags unsupported documents and ambiguous dates for human review. Original forms, checkbox appearance, and OCR errors can affect interpretation. The county determines eligibility, acceptance, and benefit status.', 'Este prototipo se centra en avisos de renovaci\xF3n y verificaci\xF3n de CalFresh en ingl\xE9s. Marca documentos no compatibles y fechas ambiguas para revisi\xF3n humana. Los formularios, casillas y errores de reconocimiento pueden afectar la interpretaci\xF3n. El condado determina elegibilidad, aceptaci\xF3n y estado de beneficios.')}</p><div class="button-row"><button class="button light" data-action="prepare-offline">${icon('download', 13)}${t('Prepare readers for offline use', 'Preparar lectores sin conexi\xF3n')}</button><button class="button light" data-action="backup">${t('Download backup', 'Descargar copia')}</button></div><p><a href="./privacy.html">${t('Read the full privacy policy', 'Leer la política de privacidad completa')}</a> · <a href="./terms.html">${t('Terms of use', 'Condiciones de uso')}</a></p><p id="offline-status" class="hint" role="status"></p></div>`,
  );
}
app.addEventListener('click', handleClick);
modal.addEventListener('click', handleClick);
async function handleClick(ev) {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  ev.preventDefault();
  try {
    if (assistant.action(btn)) return;
    if (a === 'form-open') {
      openForm(btn.dataset.id, btn.dataset.task);
      return;
    }
    if (
      a === 'form-section' ||
      a === 'form-preview' ||
      a === 'form-export-pdf' ||
      a === 'form-export-notes'
    ) {
      const form = $('#form-assistance-draft');
      if (!form?.reportValidity() || !activeForm) return;
      const context = activeForm;
      await saveActiveForm();
      if (context !== activeForm || !formRecord(context)) return;
      if (a === 'form-section') {
        context.section = Math.max(
          0,
          Math.min(context.assistance.sections.length - 1, Number(btn.dataset.section) || 0),
        );
        context.previewPage = context.assistance.sections[context.section].page;
        showActiveForm();
        $('#form-assist-section-title')?.scrollIntoView({ block: 'nearest' });
      } else if (a === 'form-preview') {
        context.previewPage = Math.max(
          1,
          Math.min(context.assistance.form?.pages || 100, Number(btn.dataset.page) || 1),
        );
        showActiveForm();
      } else if (a === 'form-export-notes') {
        downloadFile(
          'anchor-preparation-notes.txt',
          formDraftSummary(context.assistance, context.draft),
          'text/plain;charset=utf-8',
        );
      } else {
        const record = formRecord(context);
        if (record.attachmentId)
          throw new Error(
            'Use your attached form and preparation notes. Official field mappings apply only to the verified blank.',
          );
        const documents = await import('./form-documents.js');
        const bytes = await documents.fillOfficialForm(
          context.assistance.form,
          toPdfFieldValues(context.assistance, context.draft),
        );
        if (context !== activeForm || !formRecord(context)) return;
        downloadFile('anchor-unsigned-cf37-draft.pdf', bytes, 'application/pdf');
        toast(
          t(
            'Unsigned draft downloaded. Review every page and sign the actual form before returning it.',
            'Borrador sin firmar descargado. Revisa todas las páginas y firma antes de enviarlo.',
          ),
        );
      }
      return;
    }
    if (a === 'calendar-preview') {
      navigate('calendar');
      return;
    }
    if (a === 'calendar-disconnect') {
      calendarClient.clear();
      calendarPending = null;
      calendarStatus = t(
        'Calendar disconnected for this session. Your existing events are unchanged.',
        'Calendario desconectado. Los eventos existentes se conservan.',
      );
      render();
      return;
    }
    if (a === 'calendar-connect') {
      if (calendarBusy || state.mode === 'demo') return;
      const all = getCalendarCandidates(workspace().notices, state.lang);
      const candidates = [
        ...document.querySelectorAll('#calendar-form input[name="event"]:checked'),
      ]
        .map((input) => all[Number(input.value)])
        .filter(Boolean);
      if (!candidates.length)
        throw new Error(
          t('Choose at least one checked date.', 'Elige al menos una fecha verificada.'),
        );
      const owner = `${accountInfo.user?.id || 'guest'}:${state.mode}`;
      // Google's popup starts directly from this click's user gesture.
      if (!calendarClient.connected) await calendarClient.connect();
      if (owner !== `${accountInfo.user?.id || 'guest'}:${state.mode}`) return;
      previewCalendar(candidates);
      return;
    }
    if (a === 'calendar-create') {
      if (
        calendarBusy ||
        !calendarPending ||
        calendarPending.owner !== `${accountInfo.user?.id || 'guest'}:${state.mode}`
      )
        return;
      const context = calendarPending;
      calendarBusy = true;
      btn.disabled = true;
      const status = $('#calendar-create-status');
      try {
        const current = new Set(
          getCalendarCandidates(workspace().notices, state.lang).map((item) => item.key),
        );
        if (context.candidates.some((item) => !current.has(item.key)))
          throw new Error('The checked dates changed. Review the Calendar page again.');
        const events = await Promise.all(
          context.candidates.map((item) =>
            createCalendarEvent(item, {
              namespace: accountInfo.user?.id || 'guest',
              mode: state.mode,
            }),
          ),
        );
        if (context !== calendarPending) return;
        const results = await calendarClient.addEvents(events);
        if (context !== calendarPending) return;
        calendarStatus = t(
          `${results.length} reminders checked in Google Calendar. Repeated reminders preserve existing events.`,
          `${results.length} recordatorios revisados en Google Calendar. Los repetidos conservan eventos existentes.`,
        );
        modal.close();
        calendarPending = null;
        render();
        toast(calendarStatus);
      } catch (error) {
        if (status?.isConnected) status.textContent = error.message;
        btn.disabled = false;
      } finally {
        calendarBusy = false;
        if (page === 'calendar' && !modal.open) render();
      }
      return;
    }
    if (a === 'workspace-personal' || a === 'workspace-demo') {
      state.mode = a === 'workspace-personal' ? 'personal' : 'demo';
      await persist();
      navigate('overview');
      return;
    }
    if (a === 'continuity-capacity') {
      continuityCapacity = [15, 30, 60].includes(Number(btn.dataset.minutes))
        ? Number(btn.dataset.minutes)
        : 30;
      render();
      return;
    }
    if (a === 'continuity-acknowledge') {
      acknowledgmentModal(btn.dataset.id, btn.dataset.submission);
      return;
    }
    if (a === 'continuity-reuse') {
      reuseModal(btn);
      return;
    }
    if (a === 'account') {
      accountModal();
      return;
    }
    if (a === 'guide') {
      if (modal.open) modal.close();
      guide?.start();
      return;
    }
    if (a === 'sync-account') {
      await accountAction(() => account.syncNow());
      accountModal();
      return;
    }
    if (a === 'import-local') {
      await accountAction(() => account.importLocal());
      accountModal();
      return;
    }
    if (a === 'signout-account') {
      await accountAction(() => account.signOut());
      modal.close();
      navigate('overview');
      return;
    }
    if (a === 'conflict-remote' || a === 'conflict-local') {
      await accountAction(() =>
        account.resolveConflict(a === 'conflict-remote' ? 'remote' : 'local'),
      );
      accountModal();
      return;
    }
    if (a === 'nav') {
      navigate(btn.dataset.page);
      return;
    }
    if (a === 'menu') {
      navOpen = !navOpen;
      render();
      return;
    }
    if (a === 'review') {
      openReview(btn.dataset.id);
      return;
    }
    if (a === 'source') {
      openReview(btn.dataset.id, Number(btn.dataset.line));
      return;
    }
    if (a === 'clear-highlight') {
      highlightLine = null;
      render();
      return;
    }
    if (a === 'import') {
      importTab = 'upload';
      importError = '';
      importModal();
      return;
    }
    if (a === 'import-tab') {
      importTab = btn.dataset.tab;
      importError = '';
      importModal();
      return;
    }
    if (a === 'choose-file') {
      $('#notice-file').click();
      return;
    }
    if (a === 'edit-date') {
      const n = noticeById(btn.dataset.id),
        d = n?.deadlines.find((x) => x.id === btn.dataset.date);
      if (d) {
        d.editing = !d.editing;
        render();
      }
      return;
    }
    if (a === 'close-modal') {
      if (modal.querySelector('#form-assistance-draft')) await saveActiveForm();
      if (busy || calendarBusy) {
        toast(
          t(
            'Your notice is still being read. Please wait.',
            'Tu aviso a\xFAn se est\xE1 leyendo. Espera un momento.',
          ),
        );
        return;
      }
      modal.close();
      return;
    }
    if (a === 'switch-mode' || a === 'demo') {
      state.mode = a === 'demo' ? 'demo' : state.mode === 'demo' ? 'personal' : 'demo';
      await persist();
      if (modal.open) modal.close();
      navigate('overview');
      return;
    }
    if (a === 'add-sample') {
      const sample = DEMO_NOTICES.find((n) => n.id === btn.dataset.id);
      if (!sample) return;
      state.mode = 'demo';
      const existing = noticeById('demo-' + sample.id);
      if (existing) {
        modal.close();
        openReview(existing.id);
        return;
      }
      await addText(sample.text, sample.filename, {
        id: 'demo-' + sample.id,
        isDemo: true,
        county: sample.county,
      });
      return;
    }
    if (a === 'confirm-plan') {
      const n = noticeById(btn.dataset.id);
      if (!n || !planReady(n)) return;
      n.reviewed = true;
      event('reviewed', t('Notice and dates reviewed', 'Aviso y fechas revisados'), n.id);
      await persist();
      navigate('plan');
      toast(
        t(
          'Your checked plan is ready. Take it one step at a time.',
          'Tu plan verificado est\xE1 listo. Sigue paso a paso.',
        ),
      );
      return;
    }
    if (a === 'task') {
      const n = noticeById(btn.dataset.id),
        r = n?.requests.find((x) => x.id === btn.dataset.task);
      if (!r) return;
      if (!n.reviewed || !planReady(n)) {
        openReview(n.id);
        toast(
          t(
            'Review the letter and confirm its dates before preparing this plan.',
            'Revisa el aviso y verifica sus fechas antes de preparar el plan.',
          ),
        );
        return;
      }
      r.status = r.status === 'done' ? 'todo' : 'done';
      event(
        'prepared',
        r.status === 'done'
          ? t('Item marked prepared', 'Documento marcado preparado')
          : t('Item returned to checklist', 'Documento vuelto a la lista'),
        n.id,
        r.title,
      );
      await persist();
      render();
      return;
    }
    if (a === 'receipt') {
      receiptModal();
      return;
    }
    if (a === 'attachment') {
      const file = await readFileAttachment(btn.dataset.attachment);
      if (!file) {
        toast(
          t(
            'That attachment is no longer in this browser.',
            'Ese archivo ya no est\xE1 en este navegador.',
          ),
        );
        return;
      }
      downloadFile(file.name, file.blob, file.type);
      return;
    }
    if (a === 'download-notice') {
      const n = noticeById(btn.dataset.id);
      if (n) downloadFile('anchor-' + n.id + '.txt', n.sourceText, 'text/plain;charset=utf-8');
      return;
    }
    if (a === 'calendar' || a === 'calendar-all') {
      const ns =
        a === 'calendar' ? [noticeById(btn.dataset.id)].filter(Boolean) : workspace().notices;
      if (ns.some((n) => hasCompetingDates(n) && !n.clarification?.trim())) {
        const unresolved = ns.find((n) => hasCompetingDates(n) && !n.clarification?.trim());
        openReview(unresolved.id);
        toast(
          t(
            'Clarify the competing dates before exporting them.',
            'Aclara las fechas contradictorias antes de exportarlas.',
          ),
        );
        return;
      }
      let count = 0;
      const cal = ns.map((n) => {
        count += n.deadlines.filter((d) => d.confirmed && d.date && !d.excluded).length;
        return createCalendar(n);
      });
      if (!count) {
        toast(
          t(
            'Check a date against your original notice before exporting it.',
            'Verifica una fecha en el aviso original antes de exportarla.',
          ),
        );
        return;
      }
      const events = cal
        .map((c) => c.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)?.join('\r\n') || '')
        .join('\r\n');
      downloadFile(
        'anchor-checked-dates.ics',
        'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Anchor//Checked dates//EN\r\nCALSCALE:GREGORIAN\r\n' +
          events +
          '\r\nEND:VCALENDAR\r\n',
        'text/calendar;charset=utf-8',
      );
      toast(
        t(
          'Calendar file saved. Import it into your calendar.',
          'Archivo guardado. Imp\xF3rtalo en tu calendario.',
        ),
      );
      return;
    }
    if (a === 'handoff') {
      handoffModal();
      return;
    }
    if (a === 'download-handoff') {
      downloadFile('anchor-navigator-handoff.txt', handoffText(), 'text/plain;charset=utf-8');
      return;
    }
    if (a === 'print-handoff') {
      $('#print-area').textContent = handoffText();
      window.print();
      return;
    }
    if (a === 'privacy') {
      privacyModal();
      return;
    }
    if (a === 'backup') {
      downloadFile('anchor-workspace-backup.json', buildBackup(state), 'application/json');
      toast(
        t(
          'Workspace text saved. Download receipt files separately.',
          'Texto guardado. Descarga los recibos por separado.',
        ),
      );
      return;
    }
    if (a === 'clear-data') {
      const practicing = state.mode === 'demo';
      const title = practicing
        ? t('Reset practice notices?', '¿Reiniciar los ejemplos?')
        : accountInfo.authenticated
          ? t('Delete your account workspace?', '¿Eliminar tu espacio de cuenta?')
          : t('Clear this device workspace?', '¿Borrar el espacio de este dispositivo?');
      const message = practicing
        ? t(
            'Reset only the fictional practice notices and progress. Your personal workspace is kept.',
            'Reinicia solo los ejemplos y su progreso. Tu espacio personal se conserva.',
          )
        : accountInfo.authenticated
          ? t(
              'Delete your personal notices, progress, and original files from this account and its local copy. Other devices will receive the empty workspace when they reconnect. Download anything you need first.',
              'Elimina los avisos, progreso y originales personales de esta cuenta y su copia local. Otros dispositivos recibirán el espacio vacío al conectarse. Descarga primero lo importante.',
            )
          : t(
              'Remove your guest workspace and files from this browser. Download anything you need first.',
              'Elimina tu espacio de invitado y archivos de este navegador. Descarga primero lo importante.',
            );
      showModal(
        modalHead(title) +
          `<div class="modal-body"><p class="body-text">${message}</p><div class="modal-bottom"><button class="button light" data-action="close-modal">${t('Keep my data', 'Conservar mis datos')}</button><button class="button danger" data-action="confirm-clear">${practicing ? t('Reset practice', 'Reiniciar práctica') : t('Delete workspace', 'Eliminar espacio')}</button></div></div>`,
      );
      return;
    }
    if (a === 'confirm-clear') {
      if (state.mode === 'demo') {
        state.demo = sampleWorkspace();
        await persist();
        modal.close();
        navigate('overview');
        return;
      }
      if (accountInfo.authenticated) await accountAction(() => account.clearWorkspace());
      else await clearState();
      state = freshState();
      state.mode = 'personal';
      await persist();
      modal.close();
      navigate('overview');
      toast(
        t(
          'Saved workspace information was cleared from this browser.',
          'Se borr\xF3 la informaci\xF3n guardada de este navegador.',
        ),
      );
      return;
    }
    if (a === 'prepare-offline') {
      await prepareReaders(btn);
      return;
    }
  } catch (err) {
    toast(
      err.message ||
        t(
          'Something did not complete. Please try again.',
          'Algo no se complet\xF3. Intenta de nuevo.',
        ),
    );
  }
}
function flushClarificationRender() {
  if (clarificationRenderDeferred) render();
}
document.addEventListener('pointerdown', () => {
  pointerDown = true;
});
for (const event of ['pointerup', 'pointercancel'])
  document.addEventListener(event, () => {
    pointerDown = false;
    requestAnimationFrame(flushClarificationRender);
  });
document.addEventListener('focusout', (ev) => {
  const noticeId = ev.target.dataset.clarify;
  if (noticeId && clarificationRenderDeferred)
    requestAnimationFrame(() => {
      // A held pointer must keep its pressed control until release/click.
      if (page === 'notices' && selected === noticeId) flushClarificationRender();
    });
});
document.addEventListener('change', async (ev) => {
  if (ev.target.id === 'form-source-file') {
    const context = activeForm,
      record = formRecord(context),
      file = ev.target.files?.[0];
    if (!record || !file) return;
    try {
      if (file.size > 20 * 1024 * 1024 || file.size === 0 || !/\.pdf$/i.test(file.name))
        throw new Error('Choose a PDF form up to 20 MB.');
      const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (header !== '%PDF-') throw new Error('This file is not a readable PDF form.');
      await saveActiveForm();
      if (context !== activeForm || !formRecord(context)) return;
      const attachmentId = await storeFile(file);
      if (context !== activeForm || !formRecord(context)) return;
      record.attachmentId = attachmentId;
      record.filename = file.name;
      await persist();
      showActiveForm();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (ev.target.matches('#form-assistance-draft [data-form-field]')) {
    await saveActiveForm();
    if (ev.target.tagName === 'SELECT' && activeForm) showActiveForm();
    return;
  }
  const el = ev.target;
  if (el.id === 'language') {
    state.lang = el.value;
    await persist();
    render();
    return;
  }
  if (el.id === 'county') {
    state.county = el.value;
    await persist();
    render();
    return;
  }
  if (el.id === 'notice-file' && el.files[0]) {
    await importFile(el.files[0]);
    return;
  }
  if (el.dataset.clarify) {
    const n = noticeById(el.dataset.clarify);
    if (n) {
      n.clarification = el.value.trim();
      n.reviewed = false;
      await persist();
      render();
    }
    return;
  }
  if (el.dataset.exclude) {
    const n = noticeById(el.dataset.notice),
      d = n?.deadlines.find((x) => x.id === el.dataset.exclude);
    if (d) {
      d.excluded = el.checked;
      n.reviewed = false;
      await persist();
      render();
    }
    return;
  }
  if (el.dataset.confirm) {
    const n = noticeById(el.dataset.notice),
      d = n?.deadlines.find((x) => x.id === el.dataset.confirm);
    if (!d || !d.date) return;
    d.confirmed = el.checked;
    if (!d.confirmed) n.reviewed = false;
    await persist();
    render();
    return;
  }
  if (el.dataset.date) {
    const n = noticeById(el.dataset.notice),
      d = n?.deadlines.find((x) => x.id === el.dataset.date);
    if (!d) return;
    if (!('originalDate' in d)) d.originalDate = d.date;
    d.date = el.value || null;
    d.confirmed = false;
    d.userEntered = true;
    n.reviewed = false;
    await persist();
    render();
  }
});
app.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'assistant-form') return;
  ev.preventDefault();
  await assistant.submit(ev.target);
});
modal.addEventListener('submit', async (ev) => {
  if (ev.target.id === 'form-assistance-draft') return;
  ev.preventDefault();
  if (busy) return;
  const form = ev.target,
    fd = new FormData(form);
  if (form.id === 'acknowledgment-form' || form.id === 'reuse-form') {
    busy = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const noticeId = form.dataset.notice;
      if (!noticeById(noticeId)) throw new Error('Notice not found.');
      const detail = String(fd.get('detail') || '').trim();
      if (!detail)
        throw new Error(t('Add the details you checked.', 'Añade los detalles que verificaste.'));
      if (form.id === 'acknowledgment-form') {
        const date = String(fd.get('date'));
        const submission = workspace().events.find(
          (item) =>
            item.id === form.dataset.submission &&
            item.kind === 'submitted' &&
            item.noticeId === noticeId,
        );
        if (
          !validDate(date) ||
          date > currentCalendarDay() ||
          !submission ||
          date < submission.date.slice(0, 10)
        )
          throw new Error(
            t(
              'Choose a response date between this submission and today.',
              'Elige una fecha de respuesta entre este envío y hoy.',
            ),
          );
        event(
          'acknowledged',
          t('Agency response recorded by you', 'Respuesta de agencia registrada por ti'),
          noticeId,
          detail,
          { date: date + 'T12:00:00', submissionEventId: submission.id },
        );
      } else {
        if (!fd.get('checked')) throw new Error('Check the original notices first.');
        if (
          !currentEvidenceMatch(
            noticeId,
            form.dataset.task,
            form.dataset.sourceNotice,
            form.dataset.sourceTask,
          )
        )
          throw new Error(
            t(
              'This match changed. Compare the original notices again.',
              'Esta coincidencia cambió. Compara los avisos originales de nuevo.',
            ),
          );
        event(
          'evidence-reused',
          t('Possible evidence match checked by you', 'Posible coincidencia verificada por ti'),
          noticeId,
          detail,
          {
            requestId: form.dataset.task,
            sourceNoticeId: form.dataset.sourceNotice,
            sourceRequestId: form.dataset.sourceTask,
          },
        );
      }
      await persist();
      modal.close();
      navigate('continuity');
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    } finally {
      busy = false;
    }
    return;
  }
  if (form.id === 'paste-form') {
    try {
      busy = true;
      await addText(
        String(fd.get('text') || ''),
        String(fd.get('name') || t('Pasted notice', 'Aviso pegado')) + '.txt',
      );
    } catch (err) {
      importError = err.message;
      importModal();
    } finally {
      busy = false;
    }
  }
  if (form.id === 'receipt-form') {
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const file = fd.get('file');
      let attachmentId = null;
      if (file?.size) attachmentId = await storeFile(file);
      const id = String(fd.get('notice'));
      if (!noticeById(id)) throw new Error('Notice not found.');
      const date = String(fd.get('date'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid date.');
      event(
        'submitted',
        t('Submission recorded via ', 'Env\xEDo registrado por ') + String(fd.get('channel')),
        id,
        String(fd.get('detail')),
        { date: date + 'T12:00:00', attachmentId, filename: file?.size ? file.name : null },
      );
      await persist();
      modal.close();
      navigate('evidence');
      toast(
        t(
          'Your record is saved locally. Check the account badge for cloud save status.',
          'El registro se guardó localmente. Revisa el estado de guardado de la cuenta.',
        ),
      );
    } catch (err) {
      toast(err.message);
      button.disabled = false;
    }
  }
});
modal.addEventListener('cancel', (ev) => {
  if (busy || calendarBusy) ev.preventDefault();
  else if (modal.querySelector('#form-assistance-draft')) saveActiveForm().catch(() => {});
});
modal.addEventListener('close', () => {
  activeForm = null;
  formPreviewGeneration++;
  if (!calendarBusy) calendarPending = null;
  guide?.refresh();
  nextStepCue?.refresh();
});
modal.addEventListener('dragover', (ev) => {
  const drop = ev.target.closest('#drop-zone');
  if (drop) {
    ev.preventDefault();
    drop.classList.add('dragover');
  }
});
modal.addEventListener('dragleave', (ev) => {
  ev.target.closest('#drop-zone')?.classList.remove('dragover');
});
modal.addEventListener('drop', (ev) => {
  const drop = ev.target.closest('#drop-zone');
  if (drop) {
    ev.preventDefault();
    drop.classList.remove('dragover');
    if (ev.dataTransfer.files[0]) importFile(ev.dataTransfer.files[0]);
  }
});
window.addEventListener('online', () => render());
window.addEventListener('offline', () => render());
window.addEventListener('hashchange', () => {
  const p = location.hash.slice(1);
  if (PAGES.includes(p)) navigate(p);
});
async function prepareReaders(btn) {
  btn.disabled = true;
  const status = $('#offline-status');
  try {
    if (!('caches' in window)) throw new Error('Offline caching is unavailable in this browser.');
    const res = await fetch(assetURL('vendor/manifest.json'));
    if (!res.ok) throw new Error('Reader assets are unavailable. Try again while connected.');
    const manifest = await res.json(),
      cache = await caches.open('anchor-readers-v1');
    let ready = 0;
    for (let i = 0; i < manifest.assets.length; i += 5) {
      await Promise.all(
        manifest.assets.slice(i, i + 5).map(async (asset) => {
          const path = assetURL(asset.path);
          const response = await fetch(path);
          if (!response.ok) throw new Error('Could not cache ' + asset.path);
          await cache.put(path, response);
          ready++;
          if (status)
            status.textContent = t(
              `Preparing readers\u2026 ${ready}/${manifest.assets.length} files`,
              `Preparando lectores\u2026 ${ready}/${manifest.assets.length} archivos`,
            );
        }),
      );
    }
    if (status)
      status.textContent = t(
        'PDF and English image readers are ready for offline use on this device.',
        'Los lectores PDF e im\xE1genes en ingl\xE9s est\xE1n listos sin conexi\xF3n en este dispositivo.',
      );
  } catch (err) {
    if (status) status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}
async function init() {
  try {
    const saved = await loadState();
    state =
      saved?.version === 1 && saved.demo?.notices && saved.personal?.notices ? saved : freshState();
  } catch {
    state = freshState();
    storageFailed = true;
  }
  const p = location.hash.slice(1);
  if (PAGES.includes(p)) page = p;
  render();
  accountTransport = createConfiguredSupabaseTransport(settings);
  account = createAccountSync({
    fetch: accountTransport.fetch,
    getState: () => state,
    onState: (saved) => {
      // A restored or switched account invalidates any open record-edit dialog.
      if (
        modal.open &&
        modal.querySelector(
          '#acknowledgment-form, #reuse-form, #form-assistance-draft, #calendar-create-status',
        )
      )
        modal.close();
      activeForm = null;
      formPreviewGeneration++;
      calendarPending = null;
      state = { ...state, ...saved, mode: 'personal' };
      selected = null;
      highlightLine = null;
      render();
    },
    onReset: (saved) => {
      if (
        modal.open &&
        modal.querySelector(
          '#acknowledgment-form, #reuse-form, #form-assistance-draft, #calendar-create-status',
        )
      )
        modal.close();
      activeForm = null;
      formPreviewGeneration++;
      calendarPending = null;
      calendarClient.clear();
      assistant.reset();
      state = saved?.demo ? saved : freshState();
      selected = null;
      highlightLine = null;
      render();
    },
    onChange: (snapshot) => {
      const signedIn = !accountInfo.authenticated && snapshot.authenticated;
      const reconnected =
        accountInfo.authenticated && !accountInfo.sessionVerified && snapshot.sessionVerified;
      if (accountInfo.user?.id !== snapshot.user?.id) {
        calendarClient.clear();
        assistant.reset();
      }
      signInTourPending ||= signedIn || reconnected;
      accountInfo = snapshot;
      app.inert = Boolean(snapshot.busy) || ['loading', 'signing-in'].includes(snapshot.syncState);
      if (state) render();
      if (
        signInTourPending &&
        snapshot.authenticated &&
        snapshot.sessionVerified &&
        !snapshot.busy &&
        !app.inert
      ) {
        if (modal.open && modal.dataset.account === 'true') modal.close();
        if (guide) {
          signInTourPending = false;
          guide.afterSignIn();
        }
        toast(
          t(
            'Signed in. Your account workspace is ready.',
            'Sesión iniciada. Tu espacio está listo.',
          ),
        );
      }
      const status = $('#account-sync-status');
      if (status) status.textContent = syncLabel();
      const loginError = $('#account-login-error');
      if (loginError) loginError.textContent = snapshot.error || '';
    },
  });
  accountTransport.onAuthChange(({ external, event, userId, previousUserId }) => {
    if (
      external &&
      event !== 'INITIAL_SESSION' &&
      (event === 'SIGNED_OUT' || userId !== previousUserId)
    ) {
      account.invalidateSession({ clearCache: event === 'SIGNED_OUT' }).catch(() => {});
    }
  });
  app.inert = true;
  busy = true;
  try {
    await account.bootstrap();
  } finally {
    app.inert = false;
    busy = false;
  }
  await persist();
  nextStepCue = createNextStepCue({
    getText: () => ({
      eyebrow: t('YOUR NEXT STEP', 'TU SIGUIENTE PASO'),
      dismiss: t('Dismiss', 'Cerrar'),
      continue: t('Continue', 'Continuar'),
    }),
  });
  updateNextStep();
  guide = createGuide({ navigate, getState: () => state });
  if (signInTourPending && accountInfo.authenticated && accountInfo.sessionVerified) {
    signInTourPending = false;
    guide.afterSignIn();
  } else guide.autoStart();
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register(assetURL('sw.js')).catch(() => {});
}
init();
