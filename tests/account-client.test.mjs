import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSync } from '../web/account.js';

const clone = (value) => value == null ? value : structuredClone(value);
const personal = (title, extra = {}) => ({ version: 1, lang: 'en', county: 'santa-clara', personal: { notices: title ? [{ id: 'notice-1', title, ...extra }] : [], events: [] } });
const full = (title, extra) => ({ ...personal(title, extra), mode: 'personal', demo: { notices: [{ id: 'demo-1', originalAttachmentId: 'sample-file' }], events: [] } });
const A = { id: 'opaque-a', name: 'Resident A', email: 'a@example.test' };
const B = { id: 'opaque-b', name: 'Resident B', email: 'b@example.test' };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function fixture(initialUser = A) {
  const states = new Map();
  const metadata = new Map();
  const attachments = new Map();
  const memory = new Map();
  let scope = 'guest';
  const storage = {
    setStorageScope(value) { scope = value; },
    getStorageScope() { return scope; },
    async loadState(owner = scope) { return clone(states.get(owner) || null); },
    async saveState(value, owner = scope) { states.set(owner, clone(value)); },
    async loadSyncMetadata(owner = scope) { return clone(metadata.get(owner) || null); },
    async saveSyncMetadata(value, owner = scope) { metadata.set(owner, clone(value)); },
    async clearState(owner = scope) { states.delete(owner); metadata.delete(owner); attachments.delete(owner); },
    async saveAttachment(file, id = 'local-file', owner = scope) {
      if (!attachments.has(owner)) attachments.set(owner, new Map());
      attachments.get(owner).set(id, { id, name: file.name, type: file.type, blob: file.slice() });
      return id;
    },
    async storeAttachment(file, owner = scope) {
      if (!attachments.has(owner)) attachments.set(owner, new Map());
      attachments.get(owner).set(file.id, clone(file));
    },
    async getAttachment(id, owner = scope) { return clone(attachments.get(owner)?.get(id) || null); },
    async listAttachments(owner = scope) { return clone([...attachments.get(owner)?.values() || []]); },
    async deleteAttachment(id, owner = scope) { attachments.get(owner)?.delete(id); },
  };
  const cloud = new Map();
  const cloudFiles = new Map();
  const api = {
    user: initialUser, configured: true, connected: true, failures: new Map(), beforePut: null, beforeFetch: null, calls: [],
    record(owner = api.user?.id) {
      if (!cloud.has(owner)) cloud.set(owner, { state: null, revision: 0 });
      return cloud.get(owner);
    },
    async fetch(path, init = {}) {
      const method = init.method || 'GET';
      api.calls.push({ path, method, body: init.body, headers: new Headers(init.headers || {}), owner: api.user?.id, credentials: init.credentials, cache: init.cache });
      if (api.beforeFetch) await api.beforeFetch(path, method);
      if (!api.connected) throw new TypeError('Network unavailable');
      if (api.failures.has(`${method} ${path}`)) return Response.json({ error: 'Service unavailable' }, { status: api.failures.get(`${method} ${path}`) });
      if (path === '/api/account') return Response.json({ configured: api.configured, authenticated: Boolean(api.user), user: api.user, csrfToken: api.user ? 'test-csrf' : null, googleClientId: api.configured ? 'test.apps.googleusercontent.com' : null });
      if (path === '/api/auth/challenge') return Response.json({ nonce: 'test-nonce' });
      if (path === '/api/auth/google') { api.user = JSON.parse(init.body).credential === 'B' ? B : A; return Response.json({ ok: true }); }
      if (!api.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (new Headers(init.headers).get('X-Anchor-Account') !== api.user.id) return Response.json({ error: 'Account changed' }, { status: 401 });
      if (!['GET', 'HEAD'].includes(method)) assert.equal(new Headers(init.headers).get('X-Anchor-CSRF'), 'test-csrf');
      const record = api.record();
      if (path === '/api/session' && method === 'DELETE') { api.user = null; return new Response(null, { status: 204 }); }
      if (path === '/api/workspace' && method === 'GET') return Response.json(record);
      if (path === '/api/workspace' && method === 'DELETE') { record.state = null; record.revision += 1; cloudFiles.delete(api.user.id); return Response.json({ revision: record.revision }); }
      if (path === '/api/workspace' && method === 'PUT') {
        const body = JSON.parse(init.body);
        if (api.beforePut) await api.beforePut(body);
        if (body.expectedRevision !== record.revision) return Response.json({ error: 'Revision conflict' }, { status: 409 });
        record.state = body.state;
        record.revision += 1;
        return Response.json(record);
      }
      if (!cloudFiles.has(api.user.id)) cloudFiles.set(api.user.id, new Map());
      const files = cloudFiles.get(api.user.id);
      if (path === '/api/attachments') return Response.json({ attachments: [...files.values()].map(({ blob, ...file }) => file) });
      if (path.startsWith('/api/attachments/')) {
        const id = decodeURIComponent(path.split('/').pop());
        if (method === 'PUT') {
          files.set(id, { id, name: decodeURIComponent(new Headers(init.headers).get('X-Anchor-Filename')), type: new Headers(init.headers).get('Content-Type'), size: init.body.size, blob: init.body });
          return Response.json({ ok: true });
        }
        if (method === 'DELETE') { files.delete(id); return new Response(null, { status: 204 }); }
        if (files.has(id)) return new Response(files.get(id).blob);
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    },
  };
  const localStorage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  let state = full('Initial device notice');
  const changes = [];
  const callbacks = { states: [], resets: [] };
  const client = (extra = {}) => createAccountSync({
    storage, localStorage, fetch: api.fetch, isOnline: () => api.connected,
    getState: () => state,
    onState: (next) => { state = { ...state, ...next }; callbacks.states.push(clone(next)); },
    onChange: (next) => changes.push(next), onReset: (next) => callbacks.resets.push(next),
    ...extra,
  });
  return { storage, states, metadata, attachments, cloud, cloudFiles, memory, api, localStorage, client, changes, callbacks, get state() { return state; } };
}

test('unconfigured account remains guest and retains the original practice workspace', async () => {
  const f = fixture(null);
  f.api.configured = false;
  const guest = { ...full('Device work'), mode: 'demo' };
  f.states.set('guest', guest);
  const account = f.client();
  await account.bootstrap();
  assert.equal(account.snapshot().configured, false);
  assert.equal(account.snapshot().authenticated, false);
  assert.equal(f.storage.getStorageScope(), 'guest');
  assert.equal(f.callbacks.resets.at(-1).mode, 'demo');
  assert.equal(f.api.calls.some((request) => request.path === '/api/workspace'), false);
  account.destroy();
});

test('a static 404 backend restores the full guest mode and first-visit samples through onReset', async () => {
  const f = fixture(null);
  f.api.failures.set('GET /api/account', 404);
  const first = f.client();
  await first.initialize();
  assert.equal(first.snapshot().syncState, 'guest');
  assert.equal(f.callbacks.resets.at(-1), null, 'No saved guest record lets the app use its original first-visit samples');
  first.destroy();
  const guest = { ...full('Saved personal notice'), mode: 'demo' };
  f.states.set('guest', guest);
  const reload = f.client();
  await reload.initialize();
  assert.equal(f.callbacks.resets.at(-1).mode, 'demo');
  assert.deepEqual(f.callbacks.resets.at(-1).demo, guest.demo);
  assert.equal(f.callbacks.resets.at(-1).personal.notices[0].title, 'Saved personal notice');
  assert.equal(f.storage.getStorageScope(), 'guest');
  reload.destroy();
});

test('sign-in restores only the account copy and leaves guest work separate until explicit import', async () => {
  const f = fixture();
  f.states.set('guest', full('Guest private notice'));
  f.api.record().state = personal('Account private notice');
  f.api.record().revision = 4;
  const account = f.client();
  await account.initialize();
  assert.equal(f.state.personal.notices[0].title, 'Account private notice');
  assert.equal(f.states.get('guest').personal.notices[0].title, 'Guest private notice');
  assert.equal(account.snapshot().hasGuestData, true);
  assert.equal(account.snapshot().revision, 4);
  assert.equal(f.api.calls.filter((request) => request.method === 'PUT').length, 0);
  assert.equal(f.storage.getStorageScope(), A.id);
  account.destroy();
});

test('originals and receipts upload before referencing state; samples and mode never sync', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  await account.saveAttachment(new File(['original notice'], 'notice one.txt', { type: 'text/plain' }), 'notice-file');
  await account.saveAttachment(new File(['receipt'], 'receipt.txt', { type: 'text/plain' }), 'receipt-file');
  await f.storage.saveAttachment(new File(['practice'], 'sample.txt', { type: 'text/plain' }), 'sample-file');
  const next = full('Personal notice', { originalAttachmentId: 'notice-file' });
  next.personal.events.push({ id: 'event-1', attachmentId: 'receipt-file' });
  await account.persist(next);
  await account.syncNow();
  const writes = f.api.calls.filter((request) => request.method === 'PUT');
  assert.deepEqual(writes.map((request) => request.path), ['/api/attachments/notice-file', '/api/attachments/receipt-file', '/api/workspace']);
  const payload = JSON.parse(writes.at(-1).body);
  assert.equal(payload.state.demo, undefined);
  assert.equal(payload.state.mode, undefined);
  assert.equal(payload.expectedRevision, 0);
  assert.equal(writes[0].headers.get('X-Anchor-Filename'), 'notice%20one.txt');
  assert.equal(writes.every((request) => request.credentials === 'same-origin' && request.cache === 'no-store'), true);
  assert.equal(account.snapshot().syncState, 'synced');
  account.destroy();
});

test('attachment failure keeps work pending and never reports a referenced original saved', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  await account.saveAttachment(new File(['original'], 'original.txt', { type: 'text/plain' }), 'file-1');
  f.api.failures.set('PUT /api/attachments/file-1', 503);
  await account.persist(full('Unsent notice', { originalAttachmentId: 'file-1' }));
  await account.syncNow();
  assert.equal(account.snapshot().syncState, 'error');
  assert.equal(account.snapshot().pendingCount, 1);
  assert.equal(f.api.record().state, null);
  assert.equal(f.api.calls.some((request) => request.path === '/api/workspace' && request.method === 'PUT'), false);
  f.api.failures.clear();
  await account.syncNow();
  assert.equal(f.api.record().state.personal.notices[0].title, 'Unsent notice');
  assert.equal(account.snapshot().syncState, 'synced');
  account.destroy();
});

test('edits made during an in-flight save drain in order without losing the latest state', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  let first = true;
  f.api.beforePut = async () => { if (first) { first = false; entered.resolve(); await release.promise; } };
  const account = f.client();
  await account.initialize();
  await account.persist(full('First edit'));
  await entered.promise;
  await account.persist(full('Second edit'));
  release.resolve();
  await account.syncNow();
  assert.equal(f.api.record().state.personal.notices[0].title, 'Second edit');
  assert.equal(f.api.record().revision, 2);
  assert.equal(account.snapshot().pendingCount, 0);
  assert.equal(f.metadata.get(A.id).dirty, false);
  account.destroy();
});

test('a revision conflict never silently overwrites another device and allows explicit remote recovery', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  f.api.record().state = personal('Other device edit');
  f.api.record().revision = 3;
  await account.persist(full('Local conflicting edit'));
  await account.syncNow();
  assert.equal(account.snapshot().syncState, 'conflict');
  assert.equal(f.api.record().state.personal.notices[0].title, 'Other device edit');
  assert.equal(f.api.calls.filter((request) => request.path === '/api/workspace' && request.method === 'PUT').length, 1);
  await account.syncNow();
  assert.equal(f.api.calls.filter((request) => request.path === '/api/workspace' && request.method === 'PUT').length, 1);
  await account.resolveConflict('remote');
  assert.equal(f.state.personal.notices[0].title, 'Other device edit');
  assert.equal(account.snapshot().syncState, 'synced');
  account.destroy();
});

test('explicit local conflict recovery refreshes the revision and uses another conditional save', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  f.api.record().state = personal('Remote');
  f.api.record().revision = 7;
  await account.persist(full('Chosen local copy'));
  await account.syncNow();
  await account.resolveConflict('local');
  assert.equal(f.api.record().state.personal.notices[0].title, 'Chosen local copy');
  assert.equal(f.api.record().revision, 8);
  const lastWrite = f.api.calls.filter((request) => request.path === '/api/workspace' && request.method === 'PUT').at(-1);
  assert.equal(JSON.parse(lastWrite.body).expectedRevision, 7);
  account.destroy();
});

test('offline work survives reload in the same account scope and signs out only after reconnecting', async () => {
  const f = fixture();
  const first = f.client();
  await first.initialize();
  f.api.connected = false;
  await first.persist(full('Offline account edit'));
  first.destroy();
  const restored = f.client();
  await restored.initialize();
  assert.equal(restored.snapshot().authenticated, true);
  assert.equal(restored.snapshot().sessionVerified, false);
  assert.equal(f.storage.getStorageScope(), A.id);
  assert.equal(f.state.personal.notices[0].title, 'Offline account edit');
  await assert.rejects(restored.signOut(), /Reconnect before signing out/);
  assert.equal(restored.snapshot().user.id, A.id);
  f.api.connected = true;
  await restored.syncNow();
  assert.equal(f.api.record().state.personal.notices[0].title, 'Offline account edit');
  await restored.signOut();
  assert.equal(f.storage.getStorageScope(), 'guest');
  assert.equal(restored.snapshot().authenticated, false);
  assert.equal(f.memory.size, 0);
  assert.equal(f.states.has(A.id), false);
  assert.equal(f.metadata.has(A.id), false);
  assert.equal(f.attachments.has(A.id), false);
  f.api.user = A;
  await restored.initialize();
  assert.equal(f.state.personal.notices[0].title, 'Offline account edit');
  restored.destroy();
});

test('a different active server account cannot receive cached offline edits from the previous account', async () => {
  const f = fixture();
  const first = f.client();
  await first.initialize();
  f.api.connected = false;
  await first.persist(full('A only'));
  first.destroy();
  const restored = f.client();
  await restored.initialize();
  f.api.user = B;
  f.api.connected = true;
  await restored.syncNow();
  assert.equal(restored.snapshot().syncState, 'signed-out');
  assert.equal(f.api.record(B.id).state, null);
  await restored.initialize();
  assert.equal(restored.snapshot().user.id, B.id);
  assert.deepEqual(f.state.personal.notices, []);
  assert.equal(f.states.get(A.id).personal.notices[0].title, 'A only');
  assert.equal(f.api.calls.some((request) => request.method === 'PUT' && request.owner === B.id), false);
  restored.destroy();
});

test('explicit guest import copies only personal documents and keeps the guest originals', async () => {
  const f = fixture();
  f.states.set('guest', full('Guest to import', { originalAttachmentId: 'guest-file' }));
  await f.storage.saveAttachment(new File(['guest source'], 'guest.txt', { type: 'text/plain' }), 'guest-file', 'guest');
  await f.storage.saveAttachment(new File(['practice source'], 'sample.txt', { type: 'text/plain' }), 'sample-file', 'guest');
  const account = f.client();
  await account.initialize();
  assert.equal(f.api.record().state, null);
  await account.importLocal();
  assert.equal(f.api.record().state.personal.notices[0].title, 'Guest to import');
  assert.equal(f.cloudFiles.get(A.id).has('guest-file'), true);
  assert.equal(f.cloudFiles.get(A.id).has('sample-file'), false);
  assert.equal(f.states.get('guest').personal.notices[0].title, 'Guest to import');
  await assert.rejects(account.importLocal(), /already has a workspace/);
  account.destroy();
});

test('account attachments download on a new device, cache locally, and clear without touching guest records', async () => {
  const f = fixture();
  f.states.set('guest', full('Guest kept'));
  f.cloudFiles.set(A.id, new Map([['remote-file', { id: 'remote-file', name: 'original.txt', type: 'text/plain', size: 11, blob: new Blob(['source text'], { type: 'text/plain' }) }]]));
  f.api.record().state = personal('Remote notice', { originalAttachmentId: 'remote-file' });
  const account = f.client();
  await account.initialize();
  const attachment = await account.getAttachment('remote-file');
  assert.equal(attachment.name, 'original.txt');
  assert.equal(await attachment.blob.text(), 'source text');
  assert.equal(f.attachments.get(A.id).has('remote-file'), true);
  await account.clearWorkspace();
  assert.equal(f.api.record().state, null);
  assert.equal(f.cloudFiles.has(A.id), false);
  assert.deepEqual(f.state.personal.notices, []);
  assert.equal(f.attachments.has(A.id), false);
  assert.equal(f.states.get('guest').personal.notices[0].title, 'Guest kept');
  account.destroy();
});

test('server deletion restores an empty workspace instead of resurrecting an old account cache', async () => {
  const f = fixture();
  f.states.set(A.id, personal('Old deleted work'));
  const account = f.client();
  await account.initialize();
  assert.deepEqual(f.state.personal.notices, []);
  assert.equal(f.states.get(A.id).personal.notices.length, 0);
  account.destroy();
});

test('same-account reauthentication restores pending changes after an expired session', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  f.api.connected = false;
  await account.persist(full('Pending after expiry'));
  f.api.connected = true;
  f.api.user = null;
  await account.syncNow();
  assert.equal(account.snapshot().syncState, 'signed-out');
  await account.authenticate('A');
  assert.equal(account.snapshot().syncState, 'synced');
  assert.equal(f.api.record(A.id).state.personal.notices[0].title, 'Pending after expiry');
  account.destroy();
});

test('direct attachment reads are pinned to the visible account even if another tab changes the session', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  f.cloudFiles.set(B.id, new Map([['shared-id', { id: 'shared-id', name: 'B-only.txt', type: 'text/plain', blob: new Blob(['Private B']) }]]));
  f.api.user = B;
  await assert.rejects(account.getAttachment('shared-id'), /could not be downloaded/);
  assert.equal(f.attachments.get(A.id)?.has('shared-id') || false, false);
  assert.equal(account.snapshot().syncState, 'signed-out');
  const read = f.api.calls.at(-1);
  assert.equal(read.headers.get('X-Anchor-Account'), A.id);
  account.destroy();
});

test('cloud clearing prevents simultaneous workspace edits from recreating deleted state', async () => {
  const f = fixture();
  const account = f.client();
  await account.initialize();
  const entered = deferred();
  const release = deferred();
  f.api.beforeFetch = async (path, method) => { if (path === '/api/workspace' && method === 'DELETE') { entered.resolve(); await release.promise; } };
  const clearing = account.clearWorkspace();
  await entered.promise;
  assert.equal(account.snapshot().busy, true);
  await assert.rejects(account.persist(full('Edit during deletion')), /Wait for the account operation/);
  await assert.rejects(account.saveAttachment(new File(['late'], 'late.txt', { type: 'text/plain' })), /Wait for the account operation/);
  await account.syncNow();
  release.resolve();
  await clearing;
  assert.equal(account.snapshot().busy, false);
  assert.deepEqual(f.state.personal.notices, []);
  assert.equal(f.api.record().state, null);
  assert.equal(f.api.calls.some((call) => call.method === 'PUT' && call.path === '/api/workspace'), false);
  account.destroy();
});

test('sign-out from another tab revokes this tab’s visible account data and scoped local cache', async () => {
  const f = fixture();
  const surface = new EventTarget();
  const reset = deferred();
  const account = f.client({ window: surface, onReset: () => reset.resolve() });
  f.states.set('guest', full('Guest retained'));
  f.api.record().state = personal('Account private data');
  await account.initialize();
  assert.equal(f.state.personal.notices[0].title, 'Account private data');
  f.api.user = null;
  f.memory.clear();
  const event = new Event('storage');
  Object.defineProperties(event, { key: { value: 'anchor-account-cache-v1' }, newValue: { value: null } });
  surface.dispatchEvent(event);
  await reset.promise;
  assert.equal(account.snapshot().authenticated, false);
  assert.equal(f.storage.getStorageScope(), 'guest');
  assert.equal(f.state.personal.notices[0].title, 'Guest retained');
  assert.equal(f.states.has(A.id), false);
  account.destroy();
});

test('browser IndexedDB scopes capture operations before a user switch and preserve guest records', {
  skip: !process.env.ANCHOR_BROWSER_TEST_URL || !process.env.ANCHOR_PLAYWRIGHT_MODULE,
  timeout: 30_000,
}, async () => {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
    await page.locator('[data-action="import"]').first().waitFor();
    const result = await page.evaluate(async () => {
      const api = await import(new URL('platform.js', location.href).href);
      api.setStorageScope('guest');
      const guestWrite = api.saveState({ owner: 'guest', personal: { notices: [{ id: 'guest-record' }], events: [] } });
      api.setStorageScope('scope-A');
      const accountWrite = api.saveState({ owner: 'scope-A', personal: { notices: [{ id: 'account-record' }], events: [] } });
      const receiptWrite = api.saveAttachment(new File(['Private A'], 'private-A.txt', { type: 'text/plain' }), 'scope-file');
      api.setStorageScope('scope-B');
      await api.saveState({ owner: 'scope-B' });
      await Promise.all([guestWrite, accountWrite, receiptWrite]);
      const current = await api.loadState();
      const missing = await api.getAttachment('scope-file');
      const guest = await api.loadState('guest');
      const account = await api.loadState('scope-A');
      const files = await api.listAttachments('scope-A');
      await api.clearState('scope-A');
      return { current: current.owner, missing, guest: guest.owner, account: account.owner, original: await files[0].blob.text(), cleared: await api.loadState('scope-A'), guestStill: (await api.loadState('guest')).owner };
    });
    assert.deepEqual(result, { current: 'scope-B', missing: null, guest: 'guest', account: 'scope-A', original: 'Private A', cleared: null, guestStill: 'guest' });
  } finally { await browser.close(); }
});

test('an unavailable account backend is bounded at startup and preserves the guest workspace', async () => {
  const f = fixture(null);
  f.states.set('guest', full('Guest available'));
  const account = createAccountSync({
    storage: f.storage, localStorage: f.localStorage, accountTimeout: 20,
    fetch: (_path, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }),
  });
  const started = Date.now();
  await account.initialize();
  assert.ok(Date.now() - started < 1000);
  assert.equal(account.snapshot().authenticated, false);
  assert.match(account.snapshot().error, /Account service unavailable/);
  assert.equal(f.storage.getStorageScope(), 'guest');
  account.destroy();
});
