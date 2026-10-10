// Small presentation helpers; the server and account.js own identity and saves.
export function createAccountUI({
  getInfo,
  getState,
  translate,
  escapeHTML,
  icon,
  showModal,
  modalHead,
  modal,
  account,
}) {
  const t = translate,
    e = escapeHTML;
  function syncLabel() {
    const a = getInfo();
    if (!a.authenticated) return t('Saved on this device', 'Guardado en este dispositivo');
    const labels = {
      loading: ['Checking account…', 'Verificando cuenta…'],
      'signing-in': ['Signing in…', 'Iniciando sesión…'],
      pending: ['Changes waiting to save', 'Cambios pendientes'],
      syncing: ['Saving to your account…', 'Guardando en tu cuenta…'],
      synced: ['Saved to your account', 'Guardado en tu cuenta'],
      offline: ['Offline · changes stay here', 'Sin conexión · cambios locales'],
      error: ['Account save needs attention', 'El guardado requiere atención'],
      conflict: ['Two versions need review', 'Hay dos versiones por revisar'],
      'signed-out': ['Sign in again to save', 'Inicia sesión de nuevo para guardar'],
    };
    return t(...(labels[a.syncState] || ['Account workspace', 'Espacio de cuenta']));
  }
  function badge() {
    const a = getInfo();
    return `<button class="local-badge save-status ${['error', 'conflict'].includes(a.syncState) ? 'needs-attention' : ''}" data-action="account" aria-label="${e(t('Account and save status', 'Cuenta y estado de guardado'))}"><span class="dot"></span><span>${syncLabel()}</span></button>`;
  }
  function button() {
    const a = getInfo(),
      name = a.user?.name?.split(' ')[0] || t('My account', 'Mi cuenta');
    return `<button class="top-account account-button" data-action="account" aria-label="${e(a.authenticated ? t('Open account settings', 'Abrir ajustes de cuenta') : t('Sign in with Google', 'Iniciar sesión con Google'))}"><span class="account-icon">${icon('user', 15)}</span><span>${a.authenticated ? e(name.slice(0, 22)) : t('Sign in', 'Iniciar sesión')}</span></button>`;
  }
  function alert() {
    const a = getInfo(),
      state = getState();
    if (state.mode === 'demo') return '';
    if (!a.authenticated)
      return `<div class="account-callout"><span>${icon('lock', 17)}<span><strong>${t('Keep your progress with you.', 'Lleva tu progreso contigo.')}</strong> ${t('Sign in with Google to save across devices, or continue on this device.', 'Inicia sesión con Google para guardar en varios dispositivos o continúa en este.')}</span></span><button class="button light small" data-action="account">${t('Sign in', 'Iniciar sesión')}${icon('arrow', 12)}</button></div>`;
    if (['error', 'conflict', 'offline', 'pending', 'signed-out'].includes(a.syncState))
      return `<div class="account-callout attention" role="status"><span>${icon('warning', 17)}<span>${syncLabel()}. ${e(a.error || t('Your local copy is kept here. Open your account to check the next step.', 'Tu copia local se conserva aquí. Abre tu cuenta para revisar el siguiente paso.'))}</span></span><button class="button light small" data-action="account">${t('Check save status', 'Ver estado')}${icon('arrow', 12)}</button></div>`;
    return '';
  }
  function open() {
    const a = getInfo(),
      signed = a.authenticated;
    let body;
    if (signed) {
      body = `<div class="account-identity">${icon('user', 26)}<div><h3>${e(a.user?.name || t('Your Google account', 'Tu cuenta de Google'))}</h3><p>${e(a.user?.email || '')}</p></div><span class="tag green">Google</span></div><div class="account-save-card"><strong id="account-sync-status" role="status">${syncLabel()}</strong><p>${t('Personal notices, preparation, submission records, and original files save to this account. Practice notices stay separate.', 'Los avisos personales, preparación, registros y originales se guardan en esta cuenta. Los ejemplos se mantienen separados.')}</p>${a.error ? `<p class="error-message">${e(a.error)}</p>` : ''}${a.syncState === 'conflict' ? `<p>${t('Another device saved a different version. Download a backup before choosing which workspace to keep.', 'Otro dispositivo guardó una versión diferente. Descarga una copia antes de elegir qué espacio conservar.')}</p><div class="button-row"><button class="button light" data-action="backup">${t('Download my local backup', 'Descargar copia local')}</button><button class="button" data-action="conflict-remote">${t('Use account version', 'Usar versión de la cuenta')}</button><button class="button light" data-action="conflict-local">${t('Replace with this device', 'Reemplazar con este dispositivo')}</button></div>` : `<button class="button light small" data-action="sync-account">${t('Save now / check account', 'Guardar / revisar cuenta')}${icon('arrow', 12)}</button>`}</div>${a.hasGuestData && a.cloudEmpty ? `<div class="account-import"><h3>${t('Already started on this device?', '¿Ya empezaste en este dispositivo?')}</h3><p>${t('Your guest notices have stayed separate. Copy them, including their original files and receipts, into this empty account workspace.', 'Tus avisos de invitado siguen separados. Cópialos con sus originales y recibos a este espacio de cuenta vacío.')}</p><button class="button light" data-action="import-local">${t('Copy my device workspace', 'Copiar mi espacio local')}</button></div>` : ''}<p class="hint">${t('Offline edits wait here until you reconnect. Sign out after saving on a shared device to clear this account’s local copy.', 'Los cambios sin conexión esperan hasta que vuelvas a conectarte. Cierra sesión después de guardar en un dispositivo compartido para borrar la copia local de esta cuenta.')}</p><div class="modal-bottom"><button class="button light" data-action="close-modal">${t('Back to my workspace', 'Volver a mi espacio')}</button><button class="button light" data-action="signout-account">${t('Sign out', 'Cerrar sesión')}</button></div>`;
    } else {
      body = `<div class="login-illustration">${icon('shield', 36)}</div><h3 class="login-title">${t('Your progress, wherever you are.', 'Tu progreso, donde estés.')}</h3><p class="body-text">${t('Sign in with Google to keep your personal notices, original files, checklist, and receipts together across devices.', 'Inicia sesión con Google para conservar tus avisos, originales, lista y recibos en varios dispositivos.')}</p><div id="google-signin" class="google-signin"></div><p id="account-login-error" role="status" class="hint">${e(a.error || '')}</p>${!a.configured ? `<div class="source-info">${t('Account sign-in is being connected for this website. You can keep using your device workspace while setup is completed.', 'Se está conectando el inicio de sesión de este sitio. Puedes seguir usando tu espacio local mientras se completa la configuración.')} <a href="https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid" target="_blank" rel="noopener noreferrer">${t('Google setup instructions', 'Instrucciones de Google')}</a></div>` : ''}<ul class="account-benefits"><li>${icon('check', 14)}${t('Private account workspace', 'Espacio privado de cuenta')}</li><li>${icon('check', 14)}${t('Files are read on your device before saving', 'Los archivos se leen localmente antes de guardarse')}</li><li>${icon('check', 14)}${t('Existing guest data moves only when you choose', 'Los datos de invitado se copian solo si lo eliges')}</li></ul><div class="modal-bottom"><button class="button light full-width" data-action="close-modal">${t('Continue on this device', 'Continuar en este dispositivo')}</button></div><p class="hint">${t('Google receives your sign-in request. It does not receive your benefit documents from Anchor.', 'Google recibe la solicitud de inicio de sesión. Anchor no le envía tus documentos de beneficios.')}</p>`;
    }
    if (signed && !a.sessionVerified)
      body =
        `<div class="source-info"><strong>${t('Reconnect this account', 'Volver a conectar esta cuenta')}</strong><p>${t('Your device copy is kept here. Sign in with this same Google account to save pending changes.', 'Tu copia local se conserva aquí. Inicia sesión con la misma cuenta de Google para guardar los cambios pendientes.')}</p><div id="google-signin" class="google-signin"></div><p id="account-login-error" class="hint" role="status"></p></div>` +
        body;
    showModal(
      modalHead(
        signed
          ? t('Your account & saved progress', 'Tu cuenta y progreso')
          : t('Welcome back to Anchor', 'Bienvenido a Anchor'),
      ) + `<div class="modal-body account-modal">${body}</div>`,
    );
    modal.dataset.account = 'true';
    if (a.configured && (!signed || !a.sessionVerified))
      account()
        .mountGoogle(document.querySelector('#google-signin'))
        .catch((error) => {
          const target = document.querySelector('#account-login-error');
          if (target) target.textContent = error.message;
        });
  }
  return { syncLabel, badge, button, alert, open };
}
