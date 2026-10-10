import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSupabaseTransport, createConfiguredSupabaseTransport, validateSupabaseWorkspace } from '../src/infrastructure/supabase-transport.ts';

const A = 'e54b4d7e-a66a-4c04-ad72-10b23c8d4cc0';
const B = '37d11f44-57df-4a6d-bde5-df977714bcb3';
const ID = '60c95d0a-6d4a-4ac6-9b2b-393306332fc0';
const VERSION = '5c1e9940-d079-4ceb-94b1-c53f7a814feb';
const CLIENT_ID = '12345-anchor-test.apps.googleusercontent.com';
const state = () => ({ version: 1, lang: 'en', county: 'santa-clara', personal: { notices: [], events: [] } });
const resident = (id = A) => ({ id, email: 'resident@example.org', user_metadata: { full_name: 'Resident <One>' } });
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 5));

function fixture({ user = resident(), now = () => 1000 } = {}) {
  const calls = [];
  const subscribers = new Set();
  const rows = { anchor_workspaces: [], anchor_attachments: [] };
  const blobs = new Map();
  const rpcHandlers = new Map();
  let current = user;
  let userError = null;
  let queryHook = null;
  let authError = null;
  let rpcError = null;
  let storageError = null;

  function change(event, nextUser) {
    current = nextUser;
    for (const callback of subscribers) callback(event, nextUser ? { user: nextUser } : null);
  }
  class Query {
    filters = [];
    single = false;
    constructor(table) { this.table = table; }
    select(columns) { this.columns = columns.split(','); return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    order() { return this; }
    maybeSingle() { this.single = true; return this; }
    abortSignal(signal) { this.signal = signal; return this; }
    then(resolve, reject) {
      return (async () => {
        if (queryHook) await queryHook(this);
        if (this.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const matching = rows[this.table].filter((row) => row.user_id === current?.id && this.filters.every(([key, value]) => row[key] === value));
        const selected = matching.map((row) => Object.fromEntries(this.columns.map((key) => [key, row[key]])));
        return { data: this.single ? selected[0] || null : selected, error: null };
      })().then(resolve, reject);
    }
  }
  const client = {
    auth: {
      onAuthStateChange(callback) { subscribers.add(callback); return { data: { subscription: { unsubscribe() { subscribers.delete(callback); } } } }; },
      async getUser() { calls.push({ kind: 'getUser' }); return { data: { user: current }, error: userError }; },
      async signInWithIdToken(options) {
        calls.push({ kind: 'signIn', options });
        if (authError) return { data: { user: null }, error: authError };
        change('SIGNED_IN', resident());
        return { data: { user: current }, error: null };
      },
      async signOut(options) { calls.push({ kind: 'signOut', options }); change('SIGNED_OUT', null); return { error: null }; },
    },
    from(table) { return new Query(table); },
    rpc(name, args) {
      let signal;
      return {
        abortSignal(value) { signal = value; return this; },
        then(resolve, reject) {
          return (async () => {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            calls.push({ kind: 'rpc', name, args });
            if (rpcError) return { data: null, error: rpcError };
            assert.equal(args.p_account_id, current?.id, 'Every mutation pins the verified account');
            const handler = rpcHandlers.get(name);
            return { data: handler ? await handler(args) : { revision: 1 }, error: null };
          })().then(resolve, reject);
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'anchor-documents');
        return {
          async upload(path, blob, options) { calls.push({ kind: 'upload', path, options }); if (!storageError) blobs.set(path, blob); return { data: null, error: storageError }; },
          async download(path) { calls.push({ kind: 'download', path }); return { data: blobs.get(path) || null, error: storageError }; },
          async remove(paths) { calls.push({ kind: 'remove', paths }); if (!storageError) for (const path of paths) blobs.delete(path); return { data: null, error: storageError }; },
        };
      },
    },
  };
  const transport = createSupabaseTransport({ client, googleClientId: CLIENT_ID, now });
  return {
    client, transport, calls, rows, blobs, rpcHandlers, change,
    setUserError(value) { userError = value; }, setAuthError(value) { authError = value; },
    setQueryHook(value) { queryHook = value; }, setRPCError(value) { rpcError = value; }, setStorageError(value) { storageError = value; },
    request(path, { method = 'GET', data, body, headers = {}, signal, account = A } = {}) {
      const h = new Headers(headers);
      if (account) h.set('X-Anchor-Account', account);
      if (data !== undefined) h.set('Content-Type', 'application/json');
      return transport.fetch(path, { method, body: data === undefined ? body : JSON.stringify(data), headers: h, signal });
    },
  };
}

test('unconfigured Pages deployment remains a functional guest without backend network requests', async () => {
  const transport = createConfiguredSupabaseTransport({});
  const response = await transport.fetch('/api/account');
  assert.deepEqual(await response.json(), { configured: false, authenticated: false, user: null, csrfToken: null, googleClientId: null });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await transport.fetch('/api/auth/challenge')).status, 503);
  transport.destroy();
});

test('account response verifies Supabase Auth and exposes only display identity', async () => {
  const f = fixture();
  const response = await f.request('/api/account');
  const account = await response.json();
  assert.deepEqual(account.user, { id: A, name: 'Resident <One>', email: 'resident@example.org' });
  assert.equal(account.authenticated, true);
  assert.equal(account.csrfToken, 'supabase-bearer-session');
  assert.equal(f.calls.filter((call) => call.kind === 'getUser').length, 1);
  f.transport.destroy();
});

test('missing sessions are guests while server outages remain visible failures', async () => {
  const f = fixture({ user: null });
  f.setUserError({ name: 'AuthSessionMissingError' });
  assert.equal((await (await f.request('/api/account')).json()).authenticated, false);
  f.setUserError({ message: 'Database exploded with token secret-value' });
  const response = await f.request('/api/account');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret-value'));
  f.transport.destroy();
});

test('GIS receives hashed nonce and Supabase receives its raw nonce once', async () => {
  const f = fixture({ user: null });
  const challenge = await (await f.request('/api/auth/challenge')).json();
  assert.match(challenge.nonce, /^[0-9a-f]{64}$/);
  const response = await f.request('/api/auth/google', { method: 'POST', data: { credential: 'provider-signed-jwt-fixture' } });
  assert.equal(response.status, 200);
  const signIn = f.calls.find((call) => call.kind === 'signIn');
  assert.equal(signIn.options.provider, 'google');
  assert.equal(createHash('sha256').update(signIn.options.nonce).digest('hex'), challenge.nonce);
  assert.notEqual(signIn.options.nonce, challenge.nonce);
  assert.equal((await f.request('/api/auth/google', { method: 'POST', data: { credential: 'replay' } })).status, 401);
  f.transport.destroy();
});

test('expired or unsuccessful sign-in needs a fresh challenge and reveals no provider error', async () => {
  let clock = 1000;
  const f = fixture({ user: null, now: () => clock });
  await f.request('/api/auth/challenge');
  clock += 600001;
  assert.equal((await f.request('/api/auth/google', { method: 'POST', data: { credential: 'expired' } })).status, 401);
  await f.request('/api/auth/challenge');
  f.setAuthError({ message: 'private-provider-debug' });
  const response = await f.request('/api/auth/google', { method: 'POST', data: { credential: 'bad' } });
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes('private-provider-debug'));
  f.transport.destroy();
});

test('requests pinned to another account are rejected before database or storage access', async () => {
  const f = fixture();
  const response = await f.request('/api/workspace', { account: B });
  assert.equal(response.status, 403);
  assert.ok(!f.calls.some((call) => call.kind === 'rpc'));
  f.transport.destroy();
});

test('workspace reads recover null-state tombstones and conditional writes preserve conflicts', async () => {
  const f = fixture();
  f.rows.anchor_workspaces.push({ user_id: A, state: null, revision: 7 });
  const remote = await (await f.request('/api/workspace')).json();
  assert.deepEqual(remote, { state: null, revision: 7 });
  f.rpcHandlers.set('anchor_save_workspace', () => ({ conflict: true, revision: 8 }));
  const response = await f.request('/api/workspace', { method: 'PUT', data: { state: state(), expectedRevision: 7 } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).revision, 8);
  assert.equal(f.calls.find((call) => call.name === 'anchor_save_workspace').args.p_expected_revision, 7);
  f.transport.destroy();
});

test('practice examples, prototype fields, malformed state and giant text never reach SQL', async () => {
  const f = fixture();
  const notice = { id: 'n1', title: 'Review', sourceText: 'source', deadlines: [], requests: [], warnings: [] };
  const demo = state();
  demo.personal.notices.push({ ...notice, isDemo: true });
  const proto = JSON.parse('{"version":1,"lang":"en","county":"santa-clara","personal":{"notices":[],"events":[]},"__proto__":{}}');
  for (const invalid of [demo, proto, { ...state(), county: 'wrong' }, { ...state(), personal: { notices: [{ ...notice, sourceText: 'x'.repeat(500001) }], events: [] } }]) {
    assert.equal(validateSupabaseWorkspace(invalid), false);
    assert.equal((await f.request('/api/workspace', { method: 'PUT', data: { state: invalid, expectedRevision: 0 } })).status, 400);
  }
  assert.ok(!f.calls.some((call) => call.kind === 'rpc'));
  f.transport.destroy();
});

test('own attachments are listed without leaking private paths or pending uploads', async () => {
  const f = fixture();
  const ready = { user_id: A, id: ID, name: 'proof.txt', type: 'text/plain', size: 5, path: A + '/' + ID + '/' + VERSION, status: 'ready' };
  f.rows.anchor_attachments.push(ready, { ...ready, user_id: B }, { ...ready, id: VERSION, status: 'pending' });
  const result = await (await f.request('/api/attachments')).json();
  assert.deepEqual(result.attachments, [{ id: ID, name: 'proof.txt', type: 'text/plain', size: 5 }]);
  f.transport.destroy();
});

test('file uploads reserve, upload, then commit before becoming workspace references', async () => {
  const f = fixture();
  const path = A + '/' + ID + '/' + VERSION;
  f.rpcHandlers.set('anchor_reserve_attachment', () => ({ id: ID, path, status: 'pending' }));
  f.rpcHandlers.set('anchor_commit_attachment', () => ({ id: ID }));
  const response = await f.request('/api/attachments/' + ID, { method: 'PUT', body: new Blob(['proof'], { type: 'text/plain' }), headers: { 'Content-Type': 'text/plain', 'X-Anchor-Filename': encodeURIComponent('../proof.txt') } });
  assert.equal(response.status, 200);
  const actions = f.calls.filter((call) => call.kind !== 'getUser');
  assert.deepEqual(actions.map((call) => call.name || call.kind), ['anchor_reserve_attachment', 'upload', 'anchor_commit_attachment']);
  assert.equal(actions[0].args.p_name, '..-proof.txt');
  assert.deepEqual(actions[1].options, { contentType: 'text/plain', upsert: true, cacheControl: '0' });
  assert.equal(f.blobs.get(path).size, 5);
  f.transport.destroy();
});

test('ready evidence retries are immutable and do not overwrite the original blob', async () => {
  const f = fixture();
  f.rpcHandlers.set('anchor_reserve_attachment', () => ({ id: ID, path: A + '/' + ID + '/' + VERSION, status: 'ready' }));
  assert.equal((await f.request('/api/attachments/' + ID, { method: 'PUT', body: new Blob(['proof']), headers: { 'Content-Type': 'text/plain' } })).status, 200);
  assert.ok(!f.calls.some((call) => call.kind === 'upload'));
  f.transport.destroy();
});

test('invalid uploads and foreign storage paths are refused', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/attachments/' + ID, { method: 'PUT', body: new Blob(['<script>']), headers: { 'Content-Type': 'text/html' } })).status, 415);
  assert.equal((await f.request('/api/attachments/not-an-id')).status, 400);
  assert.equal((await f.request('/api/attachments/' + ID, { method: 'PUT', body: new Blob([]), headers: { 'Content-Type': 'text/plain' } })).status, 400);
  f.rpcHandlers.set('anchor_reserve_attachment', () => ({ id: ID, path: B + '/' + ID + '/' + VERSION, status: 'pending' }));
  assert.equal((await f.request('/api/attachments/' + ID, { method: 'PUT', body: new Blob(['proof']), headers: { 'Content-Type': 'text/plain' } })).status, 403);
  assert.ok(!f.calls.some((call) => call.kind === 'upload'));
  f.transport.destroy();
});

test('private downloads use verified owner metadata and return uncached file bytes', async () => {
  const f = fixture();
  const path = A + '/' + ID + '/' + VERSION;
  f.rows.anchor_attachments.push({ user_id: A, id: ID, name: 'proof.txt', type: 'text/plain', size: 5, path, status: 'ready' });
  f.blobs.set(path, new Blob(['proof']));
  const response = await f.request('/api/attachments/' + ID);
  assert.equal(await response.text(), 'proof');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  f.rows.anchor_attachments[0].path = B + '/' + ID + '/' + VERSION;
  assert.equal((await f.request('/api/attachments/' + ID)).status, 403);
  f.transport.destroy();
});

test('clear tombstones first, removes exact old paths, then finishes metadata cleanup', async () => {
  const f = fixture();
  const path = A + '/' + ID + '/' + VERSION;
  f.blobs.set(path, new Blob(['proof']));
  f.rpcHandlers.set('anchor_clear_workspace', () => ({ revision: 9, files: [{ id: ID, path }] }));
  f.rpcHandlers.set('anchor_finish_attachment_delete', () => ({ deleted: true }));
  const response = await f.request('/api/workspace', { method: 'DELETE' });
  assert.deepEqual(await response.json(), { deleted: true, revision: 9 });
  assert.equal(f.blobs.has(path), false);
  assert.deepEqual(f.calls.filter((call) => call.kind !== 'getUser').map((call) => call.name || call.kind),
    ['anchor_clear_workspace', 'remove', 'anchor_finish_attachment_delete']);
  f.transport.destroy();
});

test('failed object cleanup retains metadata for a safe retry', async () => {
  const f = fixture();
  f.rpcHandlers.set('anchor_begin_attachment_delete', () => ({ id: ID, path: A + '/' + ID + '/' + VERSION }));
  f.setStorageError({ message: 'offline' });
  assert.equal((await f.request('/api/attachments/' + ID, { method: 'DELETE' })).status, 503);
  assert.ok(!f.calls.some((call) => call.name === 'anchor_finish_attachment_delete'));
  f.transport.destroy();
});

test('SQL permission and lifecycle errors map to actionable response statuses', async () => {
  const f = fixture();
  for (const [error, expected] of [
    [{ code: '42501', message: 'account_changed' }, 403],
    [{ message: 'attachment_referenced' }, 409],
    [{ message: 'file_limit' }, 413],
    [{ message: 'attachment_not_ready' }, 400],
    [{ message: 'file_not_found' }, 404],
  ]) {
    f.setRPCError(error);
    assert.equal((await f.request('/api/workspace', { method: 'PUT', data: { state: state(), expectedRevision: 0 } })).status, expected);
  }
  f.transport.destroy();
});

test('managed auth changes are distinguished from external identity changes', async () => {
  const f = fixture({ user: null });
  const changes = [];
  const unsubscribe = f.transport.onAuthChange((change) => changes.push(change));
  await f.request('/api/auth/challenge');
  await f.request('/api/auth/google', { method: 'POST', data: { credential: 'provider-fixture' } });
  await nextTick();
  assert.equal(changes.at(-1).external, false);
  f.change('SIGNED_IN', resident(B));
  await nextTick();
  assert.equal(changes.at(-1).external, true);
  assert.equal(changes.at(-1).previousUserId, A);
  assert.equal(changes.at(-1).userId, B);
  unsubscribe();
  f.transport.destroy();
});

test('a session switch during a database read discards the previous account response', async () => {
  const f = fixture();
  f.change('INITIAL_SESSION', resident());
  f.rows.anchor_workspaces.push({ user_id: A, state: state(), revision: 1 });
  f.setQueryHook(() => f.change('SIGNED_IN', resident(B)));
  const response = await f.request('/api/workspace');
  assert.equal(response.status, 403);
  f.transport.destroy();
});

test('aborted requests do not return stale account results', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.request('/api/workspace', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  f.transport.destroy();
});

test('logout closes the local Supabase session and marks the event as managed', async () => {
  const f = fixture();
  const changes = [];
  f.transport.onAuthChange((change) => changes.push(change));
  assert.equal((await f.request('/api/session', { method: 'DELETE' })).status, 200);
  assert.deepEqual(f.calls.find((call) => call.kind === 'signOut').options, { scope: 'local' });
  await nextTick();
  assert.equal(changes.at(-1).external, false);
  assert.equal(changes.at(-1).userId, null);
  f.transport.destroy();
});

test('an identity switch while Auth verification awaits cannot return stale owner data', async () => {
  const f = fixture();
  f.change('INITIAL_SESSION', resident());
  const pending = f.request('/api/workspace');
  f.change('SIGNED_IN', resident(B));
  assert.equal((await pending).status, 403);
  f.transport.destroy();
});

test('a hung Auth request aborts promptly instead of blocking account startup', async () => {
  const f = fixture();
  f.client.auth.getUser = () => new Promise(() => {});
  const controller = new AbortController();
  const pending = f.request('/api/account', { signal: controller.signal });
  controller.abort();
  const outcome = await Promise.race([
    pending.then(() => 'unexpected success', (error) => error.name),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 100)),
  ]);
  assert.equal(outcome, 'AbortError');
  f.transport.destroy();
});

test('late SDK failures after cancellation stay handled', async () => {
  const f = fixture();
  let fail;
  f.client.auth.getUser = () => new Promise((resolve, reject) => { fail = reject; });
  const controller = new AbortController();
  const pending = f.request('/api/account', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  fail(new Error('late network failure'));
  await nextTick();
  f.transport.destroy();
});
