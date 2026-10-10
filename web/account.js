import * as browserStorage from './platform.js';

const IDENTITY_KEY = 'anchor-account-cache-v1';
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
let googleScriptPromise;

const copy = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
const emptyPersonal = () => ({ notices: [], events: [] });
const workspaceState = (value = {}) => ({
  version: value.version || 1,
  lang: value.lang === 'es' ? 'es' : 'en',
  county: value.county || 'santa-clara',
  personal: copy(value.personal || emptyPersonal()),
});

function attachmentIds(state) {
  const ids = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        (key === 'attachmentId' || key === 'originalAttachmentId') &&
        typeof child === 'string' &&
        child
      )
        ids.add(child);
      else if (typeof child === 'object') walk(child);
    }
  };
  walk(state?.personal);
  return ids;
}

function hasPersonal(state) {
  return Boolean(state?.personal?.notices?.length || state?.personal?.events?.length);
}

class RequestError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.body = body;
  }
}

/** The injected transport authenticates account requests through Supabase.
 * Guest and account document caches remain separate. A cached display identity
 * permits offline access to that device's cache; it is not server authentication.
 * Supabase's SDK manages its browser session separately from these document caches.
 * Dependencies are injectable so races, conflicts, and outages can be exercised. */
export function createAccountSync(options = {}) {
  const storage = options.storage || browserStorage;
  const requestFetch = options.fetch || globalThis.fetch?.bind(globalThis);
  const identityStorage = options.localStorage || globalThis.localStorage;
  const surface = options.window || globalThis.window;
  const online = options.isOnline || (() => globalThis.navigator?.onLine !== false);
  const notifyState = options.onState || (() => {});
  const notifyChange = options.onChange || (() => {});
  const notifyStatus = options.onStatus || (() => {});
  const currentState = options.getState || (() => ({}));
  let generation = 0;
  let localQueue = Promise.resolve();
  let syncPromise;
  let refreshPromise;
  let initializeSerial = 0;
  let operationName = '';
  let destroyed = false;
  let revision = 0;
  let cloudState = null;
  let dirty = false;
  let dirtyVersion = 0;
  let pendingDeletes = new Set();
  let serverAttachments = new Map();
  let uploaded = new Set();
  let scope = 'guest';
  let csrf = '';
  let controller = new AbortController();
  let status = {
    configured: false,
    authenticated: false,
    sessionVerified: false,
    user: null,
    googleClientId: '',
    syncState: 'guest',
    pendingCount: 0,
    error: '',
    online: online(),
    hasGuestData: false,
    cloudEmpty: true,
    revision: 0,
    busy: false,
    operation: '',
  };

  function snapshot() {
    return copy({ ...status, online: online(), revision });
  }
  function emit(update = {}) {
    if (destroyed) return;
    Object.assign(status, update, { online: online(), revision });
    const value = snapshot();
    notifyChange(value);
    notifyStatus(value);
  }
  function identityRead() {
    try {
      const value = JSON.parse(identityStorage?.getItem(IDENTITY_KEY) || 'null');
      return value?.user?.id && typeof value.user.id === 'string' ? value : null;
    } catch {
      return null;
    }
  }
  function identityWrite(value) {
    try {
      value
        ? identityStorage?.setItem(IDENTITY_KEY, JSON.stringify(value))
        : identityStorage?.removeItem(IDENTITY_KEY);
    } catch {
      /* cache is optional */
    }
  }
  function active(token, accountId = scope) {
    return !destroyed && generation === token && scope === accountId;
  }
  function swapScope(accountId) {
    generation += 1;
    controller.abort();
    controller = new AbortController();
    scope = accountId || 'guest';
    storage.setStorageScope(scope);
    revision = 0;
    cloudState = null;
    dirty = false;
    dirtyVersion = 0;
    pendingDeletes = new Set();
    uploaded = new Set();
    serverAttachments = new Map();
    syncPromise = undefined;
    refreshPromise = undefined;
    return generation;
  }
  async function jsonRequest(path, init = {}) {
    if (!requestFetch) throw new RequestError('The account service is unavailable.');
    const headers = new Headers(init.headers || {});
    const method = init.method || 'GET';
    if (scope !== 'guest' && /^\/api\/(workspace|attachments|session)(\/|$)/.test(path))
      headers.set('X-Anchor-Account', scope);
    if (!['GET', 'HEAD'].includes(method) && csrf && path !== '/api/auth/google')
      headers.set('X-Anchor-CSRF', csrf);
    let timer;
    let response;
    const timed = new AbortController();
    const abort = () => timed.abort();
    const sessionSignal = controller.signal;
    sessionSignal.addEventListener('abort', abort, { once: true });
    if (sessionSignal.aborted) timed.abort();
    if (path === '/api/account')
      timer = setTimeout(() => timed.abort(), options.accountTimeout || 5000);
    try {
      response = await requestFetch(path, {
        ...init,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: timed.signal,
      });
    } finally {
      clearTimeout(timer);
      sessionSignal.removeEventListener('abort', abort);
    }
    let body = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        /* errors below remain readable */
      }
    }
    if (!response.ok)
      throw new RequestError(
        body?.error || body?.message || `Account request failed (${response.status}).`,
        response.status,
        body,
      );
    return body;
  }
  function metadata() {
    return {
      revision,
      dirty,
      dirtyVersion,
      pendingDeletes: [...pendingDeletes],
      uploaded: [...uploaded],
    };
  }
  function queueLocal(operation) {
    const work = localQueue.then(operation);
    localQueue = work.catch(() => {});
    return work;
  }
  function ensureEditable() {
    if (operationName)
      throw new Error('Wait for the account operation to finish before changing this workspace.');
  }
  async function exclusiveAction(name, action) {
    ensureEditable();
    operationName = name;
    emit({ busy: true, operation: name });
    try {
      await localQueue;
      if (syncPromise) await syncPromise;
      return await action();
    } finally {
      operationName = '';
      emit({ busy: false, operation: '' });
    }
  }
  async function saveMetadata(accountId = scope) {
    if (accountId !== 'guest') await storage.saveSyncMetadata(metadata(), accountId);
  }
  async function restoreMetadata(accountId) {
    const saved = await storage.loadSyncMetadata(accountId);
    revision = Number(saved?.revision) || 0;
    dirty = saved?.dirty === true;
    dirtyVersion = Number(saved?.dirtyVersion) || 0;
    pendingDeletes = new Set(saved?.pendingDeletes || []);
    uploaded = new Set(saved?.uploaded || []);
  }
  async function guestPresence() {
    const saved = await storage.loadState('guest');
    return saved;
  }
  async function useGuest(account = {}, preserveIdentity = false) {
    await localQueue;
    const token = swapScope('guest');
    csrf = '';
    if (!preserveIdentity) identityWrite(null);
    const saved = await guestPresence();
    if (!active(token, 'guest')) return snapshot();
    emit({
      configured: account.configured === true,
      authenticated: false,
      sessionVerified: true,
      user: null,
      googleClientId: account.googleClientId || '',
      syncState: 'guest',
      pendingCount: 0,
      error: '',
      cloudEmpty: true,
      hasGuestData: hasPersonal(saved),
    });
    notifyState(workspaceState(saved || {}));
    options.onReset?.(saved || null);
    return snapshot();
  }
  async function useAccount(account, verified) {
    await localQueue;
    const accountId = String(account.user.id);
    const token = swapScope(accountId);
    csrf = verified ? account.csrfToken || '' : '';
    const cached = await storage.loadState(accountId);
    if (!active(token, accountId)) return snapshot();
    await restoreMetadata(accountId);
    const guest = await guestPresence();
    if (!active(token, accountId)) return snapshot();
    emit({
      configured: account.configured !== false,
      authenticated: true,
      sessionVerified: verified,
      user: copy(account.user),
      googleClientId: account.googleClientId || '',
      syncState: verified ? 'loading' : 'offline',
      pendingCount: dirty ? 1 : 0,
      error: verified ? '' : 'Offline: showing this account’s saved device copy.',
      hasGuestData: hasPersonal(guest),
    });
    // Clear previous account immediately, including when the new cache is empty.
    notifyState(workspaceState(cached || {}));
    if (verified)
      identityWrite({
        user: account.user,
        configured: account.configured,
        googleClientId: account.googleClientId || '',
      });
    if (!verified) return snapshot();
    try {
      const [remote, files] = await Promise.all([
        jsonRequest('/api/workspace'),
        jsonRequest('/api/attachments'),
      ]);
      if (!active(token, accountId)) return snapshot();
      serverAttachments = new Map((files?.attachments || []).map((file) => [file.id, file]));
      uploaded = new Set([...uploaded, ...serverAttachments.keys()]);
      cloudState = remote?.state || null;
      status.cloudEmpty = !hasPersonal(cloudState);
      if ((dirty || pendingDeletes.size) && revision !== remote.revision) {
        emit({
          syncState: 'conflict',
          error: 'Another device changed this workspace. Choose which copy to keep before syncing.',
          pendingCount: 1,
        });
      } else if (dirty || pendingDeletes.size) {
        emit({ syncState: 'pending', error: '', pendingCount: 1 });
        await syncNow();
      } else {
        revision = Number(remote.revision) || 0;
        const next = workspaceState(cloudState || {});
        await storage.saveState(next, accountId);
        await saveMetadata(accountId);
        if (active(token, accountId)) {
          notifyState(next);
          emit({ syncState: 'synced', error: '', pendingCount: 0 });
        }
      }
    } catch (error) {
      if (active(token, accountId)) await handleSyncError(error, token, accountId);
    }
    return snapshot();
  }
  async function initialize() {
    const attempt = ++initializeSerial;
    emit({ syncState: 'loading', error: '' });
    const cachedIdentity = identityRead();
    try {
      const account = await jsonRequest('/api/account');
      if (attempt !== initializeSerial) return snapshot();
      if (account?.authenticated && account?.user?.id) return useAccount(account, true);
      return useGuest(account || {});
    } catch (error) {
      if (attempt !== initializeSerial) return snapshot();
      if (cachedIdentity) return useAccount(cachedIdentity, false);
      await useGuest({ configured: status.configured, googleClientId: status.googleClientId });
      emit({
        syncState: 'guest',
        error: 'Account service unavailable. Your device workspace is still available.',
      });
      return snapshot();
    }
  }
  async function verifySession() {
    if (status.sessionVerified && csrf) return true;
    if (refreshPromise) return refreshPromise;
    const accountId = scope;
    const token = generation;
    refreshPromise = (async () => {
      const account = await jsonRequest('/api/account');
      if (!active(token, accountId)) return false;
      if (!account?.authenticated || String(account.user?.id) !== accountId) {
        emit({
          sessionVerified: false,
          syncState: 'signed-out',
          error:
            'Your session ended. Sign in to the same Google account to sync these device changes.',
        });
        return false;
      }
      csrf = account.csrfToken || '';
      emit({ sessionVerified: true });
      return true;
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = undefined;
    }
  }
  async function authenticate(credential) {
    ensureEditable();
    if (!credential || !online()) throw new Error('Reconnect before signing in.');
    initializeSerial += 1;
    await localQueue;
    const previousAccountId = scope;
    if (status.authenticated && (dirty || pendingDeletes.size)) {
      await syncNow();
    }
    emit({ syncState: 'signing-in', error: '' });
    try {
      await jsonRequest('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const account = await jsonRequest('/api/account');
      if (
        (dirty || pendingDeletes.size) &&
        previousAccountId !== 'guest' &&
        String(account.user?.id) !== previousAccountId
      ) {
        csrf = '';
        emit({
          sessionVerified: false,
          syncState: 'signed-out',
          error:
            'This device has pending changes for the previous account. Sign in with that same Google account to save them before switching accounts.',
        });
        throw new Error(status.error);
      }
      return account?.authenticated && account?.user?.id
        ? await useAccount(account, true)
        : await useGuest(account || {});
    } catch (error) {
      emit({
        syncState:
          status.syncState === 'signed-out'
            ? 'signed-out'
            : status.authenticated
              ? 'error'
              : 'guest',
        error: error.message,
      });
      throw error;
    }
  }
  async function persist(value, internal = false) {
    if (!internal) ensureEditable();
    const accountId = scope;
    const token = generation;
    const next = accountId === 'guest' ? copy(value) : workspaceState(value);
    await queueLocal(async () => {
      await storage.saveState(next, accountId);
      if (!active(token, accountId)) return;
      if (accountId === 'guest') {
        status.hasGuestData = hasPersonal(next);
        emit();
        return;
      }
      dirty = true;
      dirtyVersion += 1;
      await saveMetadata(accountId);
      emit({
        syncState: status.syncState === 'conflict' ? 'conflict' : online() ? 'pending' : 'offline',
        pendingCount: 1,
        error: status.syncState === 'conflict' ? status.error : '',
      });
    });
    if (
      active(token, accountId) &&
      accountId !== 'guest' &&
      online() &&
      status.syncState !== 'conflict'
    ) {
      // Saving locally does not wait for a network response; the status is visible.
      syncNow().catch(() => {});
    }
  }
  async function uploadAttachment(id, token, accountId) {
    const file = await storage.getAttachment(id, accountId);
    if (!file)
      throw new Error(
        `The original attachment ${id} is missing on this device. Keep the original and try again.`,
      );
    if (!active(token, accountId)) return;
    await jsonRequest(`/api/attachments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Anchor-Filename': encodeURIComponent(file.name || 'attachment'),
      },
      body: file.blob,
    });
    if (active(token, accountId)) {
      uploaded.add(id);
      serverAttachments.set(id, { id, name: file.name, type: file.type, size: file.blob.size });
    }
  }
  async function handleSyncError(error, token, accountId) {
    if (!active(token, accountId) || error?.name === 'AbortError') return;
    if (error.status === 409) {
      // Never use a blind PUT after a revision conflict.
      try {
        const remote = await jsonRequest('/api/workspace');
        if (active(token, accountId)) cloudState = remote?.state || null;
      } catch {
        /* resolution will fetch an up-to-date revision again */
      }
      emit({
        syncState: 'conflict',
        pendingCount: 1,
        error: 'Another device changed this workspace. Choose which copy to keep before syncing.',
      });
    } else if (error.status === 401 || error.status === 403) {
      csrf = '';
      emit({
        sessionVerified: false,
        syncState: 'signed-out',
        error:
          'Your session ended. Sign in to the same Google account to sync these device changes.',
        pendingCount: dirty ? 1 : 0,
      });
    } else {
      emit({
        syncState: online() ? 'error' : 'offline',
        error: error.message || 'Your changes are saved on this device. Reconnect to sync.',
        pendingCount: dirty || pendingDeletes.size ? 1 : 0,
      });
    }
  }
  async function runSync() {
    const token = generation;
    const accountId = scope;
    await localQueue;
    if (!active(token, accountId) || accountId === 'guest') return snapshot();
    if (!online()) {
      emit({
        syncState: 'offline',
        pendingCount: dirty || pendingDeletes.size ? 1 : 0,
        error: 'Offline: changes remain on this device until you reconnect.',
      });
      return snapshot();
    }
    if (status.syncState === 'conflict') return snapshot();
    try {
      if (!(await verifySession())) return snapshot();
      if (!dirty && !pendingDeletes.size) {
        emit({ syncState: 'synced', error: '', pendingCount: 0 });
        return snapshot();
      }
      emit({ syncState: 'syncing', error: '', pendingCount: 1 });
      // Drain successive edits; each PUT is conditional on the latest revision.
      while (active(token, accountId) && (dirty || pendingDeletes.size)) {
        await localQueue;
        const next = workspaceState(await storage.loadState(accountId));
        const edit = dirtyVersion;
        for (const id of attachmentIds(next)) {
          if (!uploaded.has(id)) await uploadAttachment(id, token, accountId);
          if (!active(token, accountId)) return snapshot();
        }
        const result = await jsonRequest('/api/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: next, expectedRevision: revision }),
        });
        if (!active(token, accountId)) return snapshot();
        revision = Number(result?.revision) || revision + 1;
        cloudState = next;
        status.cloudEmpty = !hasPersonal(next);
        if (dirtyVersion === edit) dirty = false;
        // Remove blobs only after the workspace no longer refers to them.
        for (const id of [...pendingDeletes]) {
          if (attachmentIds(next).has(id)) continue;
          await jsonRequest(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (!active(token, accountId)) return snapshot();
          pendingDeletes.delete(id);
          uploaded.delete(id);
          serverAttachments.delete(id);
        }
        await queueLocal(() => saveMetadata(accountId));
        // Prevent a stale deletion request from spinning while still referenced.
        if (!dirty && [...pendingDeletes].some((id) => attachmentIds(next).has(id))) break;
      }
      if (active(token, accountId))
        emit({
          syncState: dirty || pendingDeletes.size ? 'pending' : 'synced',
          pendingCount: dirty || pendingDeletes.size ? 1 : 0,
          error: '',
        });
    } catch (error) {
      await handleSyncError(error, token, accountId);
    }
    return snapshot();
  }
  function syncNow(internal = false) {
    if (operationName && !internal) return syncPromise || Promise.resolve(snapshot());
    if (syncPromise) return syncPromise;
    const running = runSync();
    syncPromise = running;
    running
      .finally(() => {
        if (syncPromise === running) syncPromise = undefined;
      })
      .catch(() => {});
    return running;
  }
  async function saveAttachment(file, id) {
    ensureEditable();
    const accountId = scope;
    return queueLocal(() => storage.saveAttachment(file, id, accountId));
  }
  async function getAttachment(id) {
    const accountId = scope;
    const token = generation;
    const local = await storage.getAttachment(id, accountId);
    if (!active(token, accountId))
      throw new Error('The account changed. Open this attachment again.');
    if (local || accountId === 'guest') return local;
    if (!online())
      throw new Error(
        'This attachment is saved in your account. Reconnect to download it onto this device.',
      );
    if (!(await verifySession()))
      throw new Error('Sign in to the same Google account to open this attachment.');
    const response = await requestFetch(`/api/attachments/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'X-Anchor-Account': accountId },
    });
    if (!response.ok) {
      const error = new RequestError(
        'This attachment could not be downloaded. Reconnect and try again.',
        response.status,
      );
      await handleSyncError(error, token, accountId);
      throw error;
    }
    const blob = await response.blob();
    if (!active(token, accountId))
      throw new Error('The account changed. Open this attachment again.');
    const info = serverAttachments.get(id) || {};
    const file = { id, name: info.name || 'attachment', type: info.type || blob.type, blob };
    await storage.storeAttachment(file, accountId);
    return file;
  }
  async function deleteAttachment(id) {
    ensureEditable();
    const accountId = scope;
    const token = generation;
    await queueLocal(async () => {
      await storage.deleteAttachment(id, accountId);
      if (accountId !== 'guest' && active(token, accountId)) {
        pendingDeletes.add(id);
        dirty = true;
        dirtyVersion += 1;
        await saveMetadata(accountId);
        emit({ syncState: online() ? 'pending' : 'offline', pendingCount: 1 });
      }
    });
    if (accountId !== 'guest' && active(token, accountId)) syncNow().catch(() => {});
  }
  async function importLocalOperation() {
    if (!status.authenticated || scope === 'guest')
      throw new Error('Sign in before importing the device workspace.');
    if (!online() || !(await verifySession()))
      throw new Error('Reconnect and sign in before importing the device workspace.');
    await localQueue;
    if (dirty || status.syncState === 'conflict')
      throw new Error('Finish syncing or resolve your pending changes before importing.');
    const token = generation;
    const accountId = scope;
    const remote = await jsonRequest('/api/workspace');
    if (!active(token, accountId)) throw new Error('The account changed. Try importing again.');
    if (hasPersonal(remote?.state))
      throw new Error(
        'Your account already has a workspace. Import is available only for an empty account, so no existing work is overwritten.',
      );
    const guest = await storage.loadState('guest');
    if (!hasPersonal(guest))
      throw new Error(
        'There is no personal device workspace to import. Practice examples are never imported.',
      );
    const next = workspaceState(guest);
    const files = await storage.listAttachments('guest');
    const referenced = attachmentIds(next);
    for (const file of files) {
      if (referenced.has(file.id)) await storage.storeAttachment(file, accountId);
    }
    if (!active(token, accountId)) throw new Error('The account changed. Try importing again.');
    revision = Number(remote.revision) || 0;
    cloudState = remote.state || null;
    await persist(next, true);
    notifyState(next);
    await syncNow(true);
    // Leave the original guest copy intact; the user can still use it signed out.
    return snapshot();
  }
  async function resolveConflictOperation(choice) {
    if (!['remote', 'local'].includes(choice))
      throw new Error('Choose the account copy or this device copy.');
    if (!status.authenticated || !online() || !(await verifySession()))
      throw new Error('Reconnect and sign in to resolve the conflict.');
    await localQueue;
    const token = generation;
    const accountId = scope;
    const edit = dirtyVersion;
    const remote = await jsonRequest('/api/workspace');
    if (!active(token, accountId)) return snapshot();
    if (choice === 'remote') {
      const next = workspaceState(remote.state || {});
      await queueLocal(async () => {
        if (!active(token, accountId)) throw new Error('The account changed. Try resolving again.');
        if (dirtyVersion !== edit)
          throw new Error(
            'This device workspace changed while loading the account copy. Review the new changes and choose again.',
          );
        revision = Number(remote.revision) || 0;
        cloudState = remote.state || null;
        dirty = false;
        dirtyVersion += 1;
        pendingDeletes.clear();
        await storage.saveState(next, accountId);
        await saveMetadata(accountId);
      });
      if (!active(token, accountId)) return snapshot();
      notifyState(next);
      emit({ syncState: 'synced', pendingCount: 0, error: '', cloudEmpty: !hasPersonal(next) });
    } else {
      revision = Number(remote.revision) || 0;
      cloudState = remote.state || null;
      dirty = true;
      await saveMetadata(accountId);
      emit({ syncState: 'pending', error: '', pendingCount: 1 });
      await syncNow(true);
    }
    return snapshot();
  }
  async function signOutOperation() {
    if (!status.authenticated) return snapshot();
    if (!online())
      throw new Error(
        'Reconnect before signing out so pending changes and the server session can be safely closed.',
      );
    initializeSerial += 1;
    const previousAccountId = scope;
    await localQueue;
    await syncNow(true);
    if (dirty || status.syncState === 'conflict' || pendingDeletes.size)
      throw new Error(
        'Your changes are still pending. Sync them or resolve the conflict before signing out.',
      );
    if (!(await verifySession()))
      throw new Error('Reconnect and sign in to safely close this account session.');
    await jsonRequest('/api/session', { method: 'DELETE' });
    await storage.clearState(previousAccountId);
    const previous = { configured: status.configured, googleClientId: status.googleClientId };
    surface?.google?.accounts?.id?.disableAutoSelect?.();
    return useGuest(previous);
  }
  async function clearWorkspaceOperation() {
    await localQueue;
    const token = generation;
    const accountId = scope;
    const next = workspaceState({ ...currentState(), personal: emptyPersonal() });
    if (accountId === 'guest') {
      await storage.clearState('guest');
      emit({ hasGuestData: false });
      notifyState(next);
      return snapshot();
    }
    if (!online() || !(await verifySession()))
      throw new Error('Reconnect and sign in before deleting the account workspace.');
    if (syncPromise) await syncPromise;
    const result = await jsonRequest('/api/workspace', { method: 'DELETE' });
    if (!active(token, accountId)) return snapshot();
    revision = Number(result?.revision) || 0;
    cloudState = null;
    dirty = false;
    dirtyVersion += 1;
    pendingDeletes.clear();
    uploaded.clear();
    serverAttachments.clear();
    await storage.clearState(accountId);
    await storage.saveState(next, accountId);
    await saveMetadata(accountId);
    notifyState(next);
    emit({ cloudEmpty: true, syncState: 'synced', pendingCount: 0, error: '' });
    return snapshot();
  }
  async function mountGoogle(element) {
    if (!element) return;
    element.replaceChildren();
    if (!status.configured || !status.googleClientId) {
      element.textContent = 'Google sign-in is not configured for this deployment yet.';
      return;
    }
    if (!online()) {
      element.textContent = 'Reconnect to sign in with Google.';
      return;
    }
    const document = element.ownerDocument;
    if (!surface?.google?.accounts?.id) {
      if (!googleScriptPromise)
        googleScriptPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = GOOGLE_SCRIPT;
          script.async = true;
          script.defer = true;
          script.onload = resolve;
          script.onerror = () => {
            googleScriptPromise = undefined;
            reject(new Error('Google sign-in could not load. Reconnect and try again.'));
          };
          document.head.append(script);
        });
      await googleScriptPromise;
    }
    const challenge = await jsonRequest('/api/auth/challenge');
    surface.google.accounts.id.initialize({
      client_id: status.googleClientId,
      nonce: challenge.nonce,
      auto_select: false,
      ux_mode: 'popup',
      itp_support: true,
      callback: (response) => {
        authenticate(response.credential).catch(() => {});
      },
    });
    if (!element.isConnected) return;
    surface.google.accounts.id.renderButton(element, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: Math.min(340, Math.max(200, element.clientWidth || 280)),
    });
  }
  const onOnline = () => {
    emit({ online: true });
    if (scope !== 'guest') syncNow().catch(() => {});
  };
  const onOffline = () =>
    emit({
      syncState: status.authenticated ? 'offline' : 'guest',
      error: status.authenticated
        ? 'Offline: changes remain on this device until you reconnect.'
        : '',
    });
  const onStorage = (event) => {
    if (event.key !== IDENTITY_KEY || !status.authenticated) return;
    let nextIdentity;
    try {
      nextIdentity = JSON.parse(event.newValue || 'null');
    } catch {
      nextIdentity = null;
    }
    if (nextIdentity?.user?.id === scope) return;
    const previousId = scope;
    const accountConfig = { configured: status.configured, googleClientId: status.googleClientId };
    // Revoke visible in-memory access promptly when another tab signs out or
    // switches accounts. Never broadcast another removal over a new identity.
    initializeSerial += 1;
    generation += 1;
    controller.abort();
    (async () => {
      await localQueue;
      if (!nextIdentity) await storage.clearState(previousId);
      await useGuest(accountConfig, true);
      if (nextIdentity) await initialize();
    })().catch(() => {
      swapScope('guest');
      notifyState(workspaceState({}));
      options.onReset?.(null);
      emit({
        authenticated: false,
        sessionVerified: false,
        user: null,
        syncState: 'guest',
        error: 'The account changed in another tab. Sign in again to continue.',
      });
    });
  };
  const beforeUnload = (event) => {
    if (!dirty || scope === 'guest') return;
    event.preventDefault();
    event.returnValue = '';
  };
  surface?.addEventListener?.('online', onOnline);
  surface?.addEventListener?.('offline', onOffline);
  surface?.addEventListener?.('beforeunload', beforeUnload);
  surface?.addEventListener?.('storage', onStorage);
  function destroy() {
    destroyed = true;
    generation += 1;
    controller.abort();
    surface?.removeEventListener?.('online', onOnline);
    surface?.removeEventListener?.('offline', onOffline);
    surface?.removeEventListener?.('beforeunload', beforeUnload);
    surface?.removeEventListener?.('storage', onStorage);
  }
  /** An SDK account change must cancel old requests before a new owner can load.
   * Queued writes retain their captured owner; they cannot target the new account.
   * A sign-out clears that account's device cache after outstanding local writes.
   */
  async function invalidateSession({ clearCache = false } = {}) {
    const previousId = scope;
    initializeSerial += 1;
    generation += 1;
    controller.abort();
    notifyState(workspaceState({}));
    emit({ sessionVerified: false, syncState: 'loading' });
    await localQueue;
    if (clearCache && previousId !== 'guest') await storage.clearState(previousId);
    await useGuest({ configured: status.configured, googleClientId: status.googleClientId });
    return initialize();
  }
  const importLocal = () => exclusiveAction('import', importLocalOperation);
  const resolveConflict = (choice) =>
    exclusiveAction('resolve', () => resolveConflictOperation(choice));
  const signOut = () => exclusiveAction('sign-out', signOutOperation);
  const clearWorkspace = () => exclusiveAction('clear', clearWorkspaceOperation);
  return {
    initialize,
    bootstrap: initialize,
    snapshot,
    persist,
    saveAttachment,
    getAttachment,
    deleteAttachment,
    clearWorkspace,
    syncNow,
    importLocal,
    signOut,
    resolveConflict,
    mountGoogle,
    authenticate,
    invalidateSession,
    destroy,
  };
}
