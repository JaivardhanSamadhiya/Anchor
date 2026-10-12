// Anchor's walkthrough only changes the displayed page and its session preference.
// It never imports, confirms, submits, or deletes a person's notice or progress.
export const GUIDE_STORAGE_KEY = 'anchor-guide-session-v2';

export function guideSteps(lang = 'en') {
  const es = lang === 'es';
  return [
    {
      id: 'overview',
      page: 'overview',
      title: es ? 'Empieza con una vista clara' : 'Start with a clear overview',
      body: es
        ? 'Aquí verás tus avisos, las fechas que debes revisar y tu siguiente paso. Puedes practicar con avisos ficticios antes de agregar los tuyos.'
        : 'See your notices, dates to check, and next step together. You can practice with fictional notices before adding your own.',
      tip: es
        ? 'La franja de práctica identifica los ejemplos. Tus avisos se guardan por separado.'
        : 'The sample banner identifies practice notices. Your own letters stay separate.',
    },
    {
      id: 'account',
      page: 'overview',
      title: es ? 'Elige dónde guardar tu progreso' : 'Choose how to save your progress',
      body: es
        ? 'Usa el botón de cuenta para iniciar sesión con Google y revisar el estado de guardado. Si continúas como invitado, tu progreso queda en este dispositivo.'
        : 'Use the account button to sign in with Google and check your save status. If you continue as a guest, progress stays on this device.',
      tip: es
        ? 'Tu espacio de práctica se mantiene separado de tus propios avisos.'
        : 'Your sample workspace stays separate from your own notices.',
    },
    {
      id: 'notices',
      page: 'notices',
      title: es ? 'Agrega y revisa un aviso' : 'Add a notice. Check the original.',
      body: es
        ? 'Agrega un PDF, una foto o el texto de tu aviso. Abre el aviso y usa «Mostrar en el aviso» para encontrar el texto original de cada fecha y solicitud.'
        : 'Add a PDF, photo, or the text of your letter. Open the notice and use “Show in the letter” to find the exact wording behind each date and request.',
      tip: es
        ? 'Verifica cada fecha antes de usar el plan. Si no está clara, pide una aclaración al condado.'
        : 'Check every date before using the plan. Ask the county to clarify anything unclear.',
    },
    {
      id: 'plan',
      page: 'plan',
      title: es ? 'Prepara un paso a la vez' : 'Prepare one step at a time',
      body: es
        ? 'Tu plan reúne lo que solicita el aviso. Después de revisar las fechas, marca los elementos que hayas preparado y guarda las fechas verificadas en tu calendario.'
        : 'Your plan brings the letter’s requests together. After reviewing the dates, mark items you have prepared and save checked dates to your calendar.',
      tip: es
        ? 'Marcar algo como preparado no lo envía al condado.'
        : 'Marking an item prepared does not send it to the county.',
    },
    {
      id: 'readiness',
      page: 'readiness',
      title: es ? 'Revisa el paquete antes de enviar' : 'Check your packet before sending',
      body: es
        ? 'Agrega los comprobantes solicitados y verifica su tipo, persona y período en el original. Anchor señala meses diferentes, documentos faltantes y ciertos importes distintos del formulario.'
        : 'Add the requested proof and verify its kind, person and reporting period against the original. Anchor flags different months, missing evidence and certain amount differences with your form.',
      tip: es
        ? 'Elige qué incluir en un PDF para tu cita. Los formularios oficiales editables se descargan por separado.'
        : 'Choose what to include in an appointment PDF. Editable official forms remain separate downloads.',
    },
    {
      id: 'evidence',
      page: 'evidence',
      title: es ? 'Conserva pruebas de lo que envías' : 'Keep proof of what you send',
      body: es
        ? 'Después de enviar algo por un canal oficial, registra cuándo y cómo lo enviaste. Agrega un recibo o número de referencia y crea un resumen para un asesor.'
        : 'After sending something through an official channel, record when and how you sent it. Add a receipt or reference number, then make a handoff for a helper.',
      tip: es
        ? 'Un registro en Anchor conserva tu información; no confirma que el condado la haya aceptado.'
        : 'An Anchor record preserves your account of a submission; it does not confirm county acceptance.',
    },
    {
      id: 'continuity',
      page: 'continuity',
      title: es ? 'Mira el panorama completo' : 'See the whole picture',
      body: es
        ? 'Compara los avisos, encuentra pasos bloqueados y elige qué revisar en el tiempo disponible. Conserva las respuestas de la agencia junto a cada envío.'
        : 'Compare notices, find blocked steps, and choose what to review in the time you have. Keep agency responses linked to each submission.',
      tip: es
        ? 'La comparación organiza tus próximos pasos; no predice aprobación de beneficios.'
        : 'The comparison organizes next steps; it does not predict benefit approval.',
    },
    {
      id: 'library',
      page: 'library',
      title: es ? 'Consulta una respuesta con su fuente' : 'Find an answer with its source',
      body: es
        ? 'Busca orientación revisada por programa y condado, y abre las instrucciones oficiales. También puedes pedir a Anchor una explicación de un tema público desde el asistente.'
        : 'Search reviewed guidance by program and county, then open the official instructions. You can also ask Anchor to explain a public topic from the assistant.',
      tip: es
        ? 'La búsqueda se realiza en este dispositivo. Los resúmenes no deciden la elegibilidad de tu caso.'
        : 'Search runs on this device. The summaries do not decide your case eligibility.',
    },
    {
      id: 'support',
      page: 'support',
      title: es ? 'Encuentra ayuda cuando la necesites' : 'Find a person when you need one',
      body: es
        ? 'Aquí encontrarás contactos del condado y servicios oficiales. Lleva tu aviso original y el resumen de Anchor para explicar qué necesitas aclarar.'
        : 'Find county contacts and official services here. Bring your original notice and Anchor handoff to explain what you need clarified.',
      tip: es
        ? 'Puedes repetir esta guía cuando quieras con el botón «Guía».'
        : 'You can replay this walkthrough anytime with the Guide button.',
    },
  ];
}

export function createGuide({
  navigate,
  getState = () => ({}),
  storageKey = GUIDE_STORAGE_KEY,
} = {}) {
  if (typeof navigate !== 'function')
    throw new TypeError('The walkthrough needs a navigate function.');
  const dialog = document.createElement('dialog');
  dialog.className = 'anchor-guide';
  dialog.setAttribute('aria-labelledby', 'anchor-guide-title');
  dialog.setAttribute('aria-describedby', 'anchor-guide-description');
  dialog.setAttribute('aria-modal', 'true');
  document.body.append(dialog);
  let active = false,
    welcome = false,
    accountWelcome = false,
    index = 0,
    previousFocus = null;
  let frame = 0,
    transition = 0,
    navigating = false,
    destroyed = false,
    entrySeen = false,
    pendingWelcome = null;
  const locale = () => (getState()?.lang === 'es' ? 'es' : 'en');
  const t = (en, es) => (locale() === 'es' ? es : en);
  function remember(status) {
    entrySeen = true;
    try {
      sessionStorage.setItem(storageKey, status);
    } catch {
      /* A blocked preference must not block access. */
    }
  }
  function seen() {
    try {
      return entrySeen || Boolean(sessionStorage.getItem(storageKey));
    } catch {
      return entrySeen;
    }
  }
  function blocked() {
    return Boolean(
      document.querySelector('dialog[open]:not(.anchor-guide)') ||
      document.querySelector('#app[inert]'),
    );
  }
  function captureFocus() {
    const element = document.activeElement;
    return {
      element,
      action: element?.getAttribute?.('data-action'),
      id: element?.id || null,
    };
  }
  function restoreFocus() {
    const candidate = previousFocus?.element;
    if (candidate?.isConnected && candidate !== document.body)
      return candidate.focus({ preventScroll: true });
    if (previousFocus?.id) {
      const replacement = document.getElementById(previousFocus.id);
      if (replacement) return replacement.focus({ preventScroll: true });
    }
    const fallback =
      document.querySelector('[data-action="guide"]') || document.querySelector('#main');
    fallback?.focus({ preventScroll: true });
  }
  function close(status = 'dismissed') {
    if (!active) return;
    active = false;
    transition++;
    cancelAnimationFrame(frame);
    remember(status);
    if (dialog.open) dialog.close();
    dialog.replaceChildren();
    restoreFocus();
  }
  function open() {
    if (!active) previousFocus = captureFocus();
    active = true;
    if (!dialog.open) dialog.showModal();
  }
  function targetFor(step) {
    const selectors =
      step.id === 'account'
        ? ['[data-action="account"]', '[data-action="login"]', '.top-account', '.top-controls']
        : [`.nav [data-action="nav"][data-page="${step.page}"]`, '#main .page-head', '#main'];
    return selectors
      .map((selector) => document.querySelector(selector))
      .find((element) => {
        if (!element) return false;
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.right > 0 &&
          box.left < innerWidth &&
          box.bottom > 0 &&
          box.top < innerHeight
        );
      });
  }
  function position() {
    if (!active || welcome) return;
    const spotlight = dialog.querySelector('.anchor-guide-spotlight');
    const card = dialog.querySelector('.anchor-guide-card');
    const target = targetFor(guideSteps(locale())[index]);
    const mobile = innerWidth <= 700;
    const pad = 8;
    const raw = target?.getBoundingClientRect() || {
      left: 12,
      top: 72,
      right: innerWidth - 12,
      bottom: 146,
    };
    const box = {
      left: Math.max(pad, raw.left - 5),
      top: Math.max(pad, raw.top - 5),
      right: Math.min(innerWidth - pad, raw.right + 5),
      bottom: Math.min(innerHeight - pad, raw.bottom + 5, raw.top + (mobile ? 115 : 180)),
    };
    Object.assign(spotlight.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${Math.max(20, box.right - box.left)}px`,
      height: `${Math.max(20, box.bottom - box.top)}px`,
    });
    if (mobile) {
      card.style.left = '12px';
      card.style.right = '12px';
      card.style.top = 'auto';
      card.style.bottom = 'max(12px, env(safe-area-inset-bottom))';
    } else {
      const width = Math.min(440, innerWidth - 40);
      const height = card.getBoundingClientRect().height;
      const side = box.right + 22 + width < innerWidth - 20;
      const left = side ? box.right + 22 : Math.max(20, innerWidth - width - 28);
      const top = side
        ? Math.max(24, Math.min(box.top, innerHeight - height - 24))
        : Math.max(24, Math.min(box.bottom + 20, innerHeight - height - 24));
      Object.assign(card.style, {
        left: `${left}px`,
        right: 'auto',
        top: `${top}px`,
        bottom: 'auto',
      });
    }
  }
  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }
  function renderWelcome() {
    dialog.classList.add('anchor-guide-welcome');
    dialog.innerHTML = `<div class="anchor-guide-welcome-shade" aria-hidden="true"></div>
      <section class="anchor-guide-card anchor-guide-welcome-card">
        <button class="anchor-guide-close" data-guide-action="skip" aria-label="${t('Close welcome', 'Cerrar bienvenida')}">×</button>
        <div class="anchor-guide-brand"><img src="./icon.svg" alt=""><span>Anchor</span></div>
        <p class="anchor-guide-eyebrow">${t('A LITTLE HELP GETTING STARTED', 'AYUDA PARA EMPEZAR')}</p>
        <h2 id="anchor-guide-title">${accountWelcome ? t('You’re signed in. Let’s get started.', 'Ya iniciaste sesión. Empecemos.') : t('Let’s find your next step.', 'Encontremos tu siguiente paso.')}</h2>
        <p id="anchor-guide-description">${accountWelcome ? t('Your account workspace is ready. This quick tour shows where to check your letters, prepare the next step, and find your saved records.', 'Tu espacio de cuenta está listo. Esta guía breve muestra dónde revisar tus avisos, preparar el siguiente paso y encontrar tus registros guardados.') : t('A quick tour will show you how to turn a benefits letter into a checked plan—and keep proof of what you send.', 'Esta guía breve te enseña a convertir un aviso de beneficios en un plan verificado y conservar pruebas de lo que envías.')}</p>
        <ol class="anchor-guide-preview"><li><span>1</span>${t('Bring your letter', 'Agrega tu aviso')}</li><li><span>2</span>${t('Check dates and next steps', 'Revisa fechas y pasos')}</li><li><span>3</span>${t('Save your progress and receipts', 'Guarda tu progreso y recibos')}</li></ol>
        <p class="anchor-guide-note">${t('About a minute. We’ll only show you around; your letters and progress won’t change.', 'Aproximadamente un minuto. Solo te mostramos el sitio; tus avisos y tu progreso no cambian.')}</p>
        <div class="anchor-guide-actions"><button class="anchor-guide-secondary" data-guide-action="skip">${t('Maybe later', 'Más tarde')}</button><button class="anchor-guide-primary" data-guide-action="start">${t('Start walkthrough', 'Comenzar guía')} <span aria-hidden="true">→</span></button></div>
      </section>`;
  }
  function renderStep() {
    dialog.classList.remove('anchor-guide-welcome');
    const steps = guideSteps(locale()),
      step = steps[index];
    dialog.innerHTML = `<div class="anchor-guide-spotlight" aria-hidden="true"></div>
      <section class="anchor-guide-card">
        <button class="anchor-guide-close" data-guide-action="skip" aria-label="${t('Close walkthrough', 'Cerrar guía')}">×</button>
        <p class="anchor-guide-eyebrow">${t(`YOUR QUICK TOUR · ${index + 1} OF ${steps.length}`, `TU GUÍA BREVE · ${index + 1} DE ${steps.length}`)}</p>
        <div class="anchor-guide-progress" aria-hidden="true">${steps.map((_, i) => `<span class="${i <= index ? 'is-reached' : ''}"></span>`).join('')}</div>
        <h2 id="anchor-guide-title">${step.title}</h2>
        <p id="anchor-guide-description">${step.body}</p>
        <div class="anchor-guide-tip"><span aria-hidden="true">✓</span><p>${step.tip}</p></div>
        <div class="anchor-guide-actions"><button class="anchor-guide-secondary" data-guide-action="${index ? 'back' : 'skip'}">${index ? t('Back', 'Atrás') : t('Skip tour', 'Omitir guía')}</button><button class="anchor-guide-primary" data-guide-action="next">${index === steps.length - 1 ? t('I’m ready', 'Estoy listo') : t('Next', 'Siguiente')} <span aria-hidden="true">${index === steps.length - 1 ? '✓' : '→'}</span></button></div>
      </section>`;
    schedulePosition();
  }
  function paint({ focus = true } = {}) {
    if (!active) return;
    if (welcome) renderWelcome();
    else renderStep();
    if (focus) dialog.querySelector('.anchor-guide-primary')?.focus({ preventScroll: true });
  }
  async function showStep(next) {
    if (destroyed) return;
    const token = ++transition;
    index = Math.max(0, Math.min(guideSteps(locale()).length - 1, next));
    welcome = false;
    open();
    navigating = true;
    try {
      await navigate(guideSteps(locale())[index].page);
    } finally {
      navigating = false;
      if (active && token === transition) paint();
    }
  }
  function start() {
    if (destroyed) return;
    pendingWelcome = null;
    remember('started');
    return showStep(0);
  }
  function showWelcome(reason) {
    if (destroyed) return false;
    if (blocked()) {
      // Account activation can finish while its dialog is still closing. The
      // next application render retries rather than stacking modal dialogs.
      pendingWelcome = reason;
      return false;
    }
    pendingWelcome = null;
    welcome = true;
    accountWelcome = reason === 'sign-in';
    remember('seen');
    open();
    paint();
    return true;
  }
  function autoStart() {
    if (destroyed || active || seen()) return false;
    return showWelcome('entry');
  }
  function afterSignIn() {
    // Called once by the account controller after a verified workspace becomes
    // ready. Session dismissal suppresses repeat entry, never a fresh sign-in.
    return showWelcome('sign-in');
  }
  function refresh() {
    if (pendingWelcome && !blocked()) {
      showWelcome(pendingWelcome);
      return;
    }
    if (active && !navigating) paint({ focus: false });
  }
  function onClick(event) {
    const action = event.target.closest('[data-guide-action]')?.dataset.guideAction;
    if (!action) return;
    if (action === 'skip') close();
    else if (action === 'start') void start();
    else if (action === 'back') void showStep(index - 1);
    else if (action === 'next') {
      if (index === guideSteps(locale()).length - 1) close('completed');
      else void showStep(index + 1);
    }
  }
  function onKeydown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
    const first = buttons[0],
      last = buttons.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }
  function onCancel(event) {
    event.preventDefault();
    close();
  }
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('keydown', onKeydown);
  dialog.addEventListener('cancel', onCancel);
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, true);
  return {
    autoStart,
    afterSignIn,
    start,
    refresh,
    close: () => close(),
    get isOpen() {
      return active;
    },
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      pendingWelcome = null;
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      dialog.remove();
    },
  };
}
