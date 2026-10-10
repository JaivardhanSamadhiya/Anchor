import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { createAnchorAPI, validateWorkspace } from '../server/anchor-api.js';
import { analyzeNotice } from '../web/engine.js';

const ORIGIN = 'https://anchor.example';
const CLIENT_ID = '12345-anchor-test.apps.googleusercontent.com';
const NOW = Date.parse('2026-10-10T18:00:00Z');
const UUID = '60c95d0a-6d4a-4ac6-9b2b-393306332fc0';
const keys = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const otherKeys = await generateKeyPair('RS256', { modulusLength: 2048 });
const publicJWK = { ...await exportJWK(keys.publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
const jwks = createLocalJWKSet({ keys: [publicJWK] });
const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter((file) => file.endsWith('.sql')).sort();
assert.ok(migrations.length, 'Generate the actual Drizzle migrations before running account security tests.');
const migrationSQL = await Promise.all(migrations.map((file) => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')));

class D1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    for (const sql of migrationSQL) this.sqlite.exec(sql);
  }
  prepare(sql) {
    const db = this.sqlite;
    function bound(values = []) {
      return {
        bind(...args) { return bound(args); },
        async first() { return db.prepare(sql).get(...values) || null; },
        async all() { return { results: db.prepare(sql).all(...values) }; },
        async run() {
          if (/\bRETURNING\b/i.test(sql)) {
            const results = db.prepare(sql).all(...values);
            return { success: true, results, meta: { changes: Number(db.prepare('SELECT changes() AS changes').get().changes) } };
          }
          const result = db.prepare(sql).run(...values);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        },
      };
    }
    return bound();
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

class R2Fixture {
  files = new Map();
  async put(key, bytes) { this.files.set(key, new Uint8Array(bytes)); }
  async get(key) { const bytes = this.files.get(key); return bytes ? { body: new Response(bytes).body } : null; }
  async delete(key) { this.files.delete(key); }
}

function fixture() {
  let clock = NOW;
  const env = { DB: new D1Fixture(), BUCKET: new R2Fixture(), GOOGLE_CLIENT_ID: CLIENT_ID };
  const api = createAnchorAPI({ jwks, now: () => clock });
  function request(path, { method = 'GET', cookie, csrf, account, data, bytes, origin = ORIGIN, headers = {} } = {}) {
    const h = new Headers(headers);
    if (cookie) h.set('Cookie', cookie);
    if (csrf) h.set('X-Anchor-CSRF', csrf);
    if (account?.user?.id && !h.has('X-Anchor-Account')) h.set('X-Anchor-Account', account.user.id);
    if (method !== 'GET' && origin !== null) h.set('Origin', origin);
    if (data !== undefined) h.set('Content-Type', 'application/json');
    const body = data !== undefined ? JSON.stringify(data) : bytes;
    return api(new Request(`${ORIGIN}/api/${path}`, { method, headers: h, body }), env);
  }
  return { env, request, advance(ms) { clock += ms; }, close() { env.DB.sqlite.close(); } };
}

function cookies(response) { return response.headers.getSetCookie(); }
function cookiePair(response, name) { return cookies(response).find((cookie) => cookie.startsWith(`${name}=`))?.split(';')[0]; }

async function signedToken(nonce, overrides = {}, key = keys.privateKey) {
  return new SignJWT({ nonce, email: 'resident@example.org', email_verified: true, name: 'Resident One', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setSubject(overrides.sub || 'resident-123')
    .setIssuer(overrides.iss || 'https://accounts.google.com')
    .setAudience(overrides.aud || CLIENT_ID)
    .setIssuedAt(Math.floor(NOW / 1000))
    .setExpirationTime(overrides.exp ?? Math.floor(NOW / 1000) + 600)
    .sign(key);
}

async function challenge(f) {
  const response = await f.request('auth/challenge');
  assert.equal(response.status, 200);
  return { cookie: cookiePair(response, '__Host-anchor_challenge'), nonce: (await response.json()).nonce, response };
}

async function login(f, overrides = {}) {
  const c = await challenge(f);
  const response = await f.request('auth/google', { method: 'POST', cookie: c.cookie, data: { credential: await signedToken(c.nonce, overrides) } });
  assert.equal(response.status, 200);
  const account = await response.json();
  return { cookie: cookiePair(response, '__Host-anchor_session'), csrf: account.csrfToken, account, response, challenge: c };
}

function state() {
  return { version: 1, lang: 'en', county: 'santa-clara', personal: { notices: [], events: [] } };
}

test('unconfigured Google login stays explicit and anonymous data requests are rejected', async () => {
  const f = fixture();
  delete f.env.GOOGLE_CLIENT_ID;
  assert.deepEqual(await (await f.request('account')).json(), { configured: false, authenticated: false, user: null, csrfToken: null, googleClientId: null });
  assert.equal((await f.request('auth/challenge')).status, 503);
  assert.equal((await f.request('workspace')).status, 401);
  assert.equal((await f.request(`attachments/${UUID}`)).status, 401);
  f.close();
});

test('real RSA-signed identity creates a hash-only session and secure, distinct challenge cookie', async () => {
  const f = fixture();
  const auth = await login(f);
  assert.match(cookies(auth.response)[0], /HttpOnly; Secure; SameSite=Lax/);
  assert.match(cookies(auth.response)[0], /Max-Age=2592000/);
  assert.match(cookies(auth.challenge.response)[0], /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth.challenge.nonce, /^[A-Za-z0-9_-]{43}$/);
  const session = f.env.DB.sqlite.prepare('SELECT * FROM anchor_sessions').get();
  assert.match(session.token_hash, /^[a-f0-9]{64}$/);
  assert.ok(!auth.cookie.includes(session.token_hash));
  assert.equal(session.user_id, 'google:resident-123');
  const account = await f.request('account', auth);
  assert.equal(account.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await account.json()).user.id, 'google:resident-123');
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM anchor_auth_challenges').get().n, 0);
  f.close();
});

test('signature, audience, issuer, expiry and nonce are verified rather than decoded', async (t) => {
  for (const [label, claims, key] of [
    ['wrong signature', {}, otherKeys.privateKey],
    ['wrong audience', { aud: '12345-other-app.apps.googleusercontent.com' }, keys.privateKey],
    ['wrong issuer', { iss: 'https://attacker.example' }, keys.privateKey],
    ['expired token', { exp: Math.floor(NOW / 1000) - 60 }, keys.privateKey],
    ['wrong nonce', { nonce: 'another-authorization-attempt' }, keys.privateKey],
    ['unverified display email', { email_verified: false }, keys.privateKey],
  ]) {
    await t.test(label, async () => {
      const f = fixture(), c = await challenge(f);
      const response = await f.request('auth/google', { method: 'POST', cookie: c.cookie, data: { credential: await signedToken(c.nonce, claims, key) } });
      assert.equal(response.status, 401);
      assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM anchor_users').get().n, 0);
      assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM anchor_sessions').get().n, 0);
      f.close();
    });
  }
});

test('Google challenge rejects replay, expired attempts, missing cookies and foreign origins', async () => {
  const f = fixture(), c = await challenge(f);
  const token = await signedToken(c.nonce);
  const action = { method: 'POST', cookie: c.cookie, data: { credential: token } };
  assert.equal((await f.request('auth/google', { ...action, origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.request('auth/google', { ...action, cookie: undefined })).status, 401);
  assert.equal((await f.request('auth/google', action)).status, 200);
  assert.equal((await f.request('auth/google', action)).status, 401);
  const expired = await challenge(f);
  f.advance(601_000);
  assert.equal((await f.request('auth/google', { ...action, cookie: expired.cookie, data: { credential: await signedToken(expired.nonce) } })).status, 401);
  f.close();
});

test('forged visitor headers, duplicate session cookies and expired sessions grant no account access', async () => {
  const f = fixture(), auth = await login(f);
  assert.equal((await f.request('workspace', { headers: { 'oai-authenticated-user-id': 'google:resident-123', 'oai-authenticated-user-email': 'resident@example.org' } })).status, 401);
  assert.equal((await f.request('workspace', { cookie: `${auth.cookie}; ${auth.cookie}` })).status, 401);
  f.advance(30 * 24 * 60 * 60 * 1000 + 1);
  assert.equal((await f.request('workspace', auth)).status, 401);
  f.close();
});

test('workspace writes require Origin and session CSRF; revisions prevent losing another device’s changes', async () => {
  const f = fixture(), auth = await login(f);
  const action = { ...auth, method: 'PUT', data: { state: state(), expectedRevision: 0 } };
  assert.equal((await f.request('workspace', { ...action, csrf: undefined })).status, 403);
  assert.equal((await f.request('workspace', { ...action, csrf: 'wrong' })).status, 403);
  assert.equal((await f.request('workspace', { ...action, origin: null })).status, 403);
  assert.equal((await f.request('workspace', { ...action, origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.request('workspace', action)).status, 200);
  const conflict = await f.request('workspace', action);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).revision, 1);
  const saved = await (await f.request('workspace', auth)).json();
  assert.deepEqual(saved.state, state());
  const updated = state(); updated.lang = 'es';
  assert.equal((await f.request('workspace', { ...action, data: { state: updated, expectedRevision: 1 } })).status, 200);
  const oldUpdate = await f.request('workspace', { ...action, data: { state: state(), expectedRevision: 1 } });
  assert.equal(oldUpdate.status, 409);
  assert.equal((await (await f.request('workspace', auth)).json()).state.lang, 'es');
  f.close();
});

test('workspace schema rejects practice data, unexpected owner keys, prototype keys and oversized bodies', async () => {
  const f = fixture(), auth = await login(f);
  const invalid = state(); invalid.demo = { notices: [] };
  const demoNotice = state(); demoNotice.personal.notices.push({ id: 'sample', title: 'Sample', sourceText: 'Fictional', isDemo: true, deadlines: [], requests: [], warnings: [] });
  const nested = state(); nested.personal.events.push({ id: 'x', kind: 'note', date: '2026-10-10', title: 'Hello', extra: JSON.parse('{"__proto__":{"polluted":true}}') });
  for (const value of [invalid, demoNotice, nested]) {
    assert.equal(validateWorkspace(value), false);
    assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: value, expectedRevision: 0 } })).status, 400);
  }
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: state(), expectedRevision: 0, userId: 'google:someone-else' } })).status, 400);
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', bytes: new TextEncoder().encode(' '.repeat(1_500_250)), headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM anchor_workspaces').get().n, 0);
  f.close();
});

test('complete source-linked notice, checked dates, preparation and receipt metadata round-trip', async () => {
  const f = fixture(), auth = await login(f);
  const source = 'County of Santa Clara\nCalFresh Information/Verification Needed\nCF377.6\nNotice Date: October 9, 2026\nPlease return the requested items by October 24, 2026.\n[X] Pay stubs for September 2026\n';
  const value = state();
  const notice = analyzeNotice(source, { id: 'personal-notice', filename: 'notice.txt', isDemo: false, now: new Date(NOW) });
  notice.reviewed = true;
  notice.originalAttachmentId = UUID;
  notice.deadlines[0].confirmed = true;
  notice.requests[0].prepared = true;
  value.personal.notices.push(notice);
  value.personal.events.push({ id: 'submission-one', kind: 'submitted', date: '2026-10-10T18:00:00Z', title: 'Submitted through official channel', noticeId: notice.id, detail: 'Reference entered by resident', attachmentId: UUID, filename: 'receipt.txt' });
  assert.equal(validateWorkspace(value), true);
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: value, expectedRevision: 0 } })).status, 200);
  const retrieved = (await (await f.request('workspace', auth)).json()).state;
  assert.deepEqual(retrieved, value);
  assert.equal(retrieved.personal.notices[0].sourceText, source);
  f.close();
});

test('two accounts cannot read, overwrite or delete each other’s state or attachments', async () => {
  const f = fixture(), a = await login(f), b = await login(f, { sub: 'resident-456', email: 'second@example.org', name: 'Resident Two' });
  await f.request('workspace', { ...a, method: 'PUT', data: { state: state(), expectedRevision: 0 } });
  assert.equal((await (await f.request('workspace', b)).json()).state, null);
  const bytes = new TextEncoder().encode('Private receipt');
  const upload = await f.request(`attachments/${UUID}`, { ...a, method: 'PUT', bytes, headers: { 'Content-Type': 'text/plain', 'X-Anchor-Filename': encodeURIComponent('receipt ñ.txt') } });
  assert.equal(upload.status, 200);
  assert.equal((await f.request(`attachments/${UUID}`, b)).status, 404);
  assert.equal((await f.request(`attachments/${UUID}`, { ...b, method: 'DELETE' })).status, 404);
  assert.deepEqual((await (await f.request('attachments', b)).json()).attachments, []);
  await f.request(`attachments/${UUID}`, { ...b, method: 'PUT', bytes: new TextEncoder().encode('Other receipt'), headers: { 'Content-Type': 'text/plain' } });
  const owned = await f.request(`attachments/${UUID}`, a);
  assert.equal(await owned.text(), 'Private receipt');
  assert.match(owned.headers.get('Content-Disposition'), /attachment;/);
  assert.match(owned.headers.get('Content-Disposition'), /filename\*=UTF-8''receipt%20%C3%B1.txt/);
  assert.equal(f.env.BUCKET.files.size, 2);
  const listing = (await (await f.request('attachments', a)).json()).attachments;
  assert.equal(listing[0].name, 'receipt ñ.txt');
  assert.ok(!JSON.stringify(listing).includes('object_key'));
  await f.request('workspace', { ...b, method: 'DELETE' });
  assert.equal(await (await f.request(`attachments/${UUID}`, a)).text(), 'Private receipt');
  assert.equal(f.env.BUCKET.files.size, 1);
  f.close();
});

test('Google subject remains the account key when an email changes', async () => {
  const f = fixture(), before = await login(f);
  await f.request('workspace', { ...before, method: 'PUT', data: { state: state(), expectedRevision: 0 } });
  const after = await login(f, { email: 'renamed@example.org' });
  assert.equal(after.account.user.id, before.account.user.id);
  assert.equal((await (await f.request('workspace', after)).json()).revision, 1);
  assert.equal(f.env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM anchor_users').get().n, 1);
  f.close();
});

test('delete keeps no resident state but its revision tombstone rejects stale writes after recreation', async () => {
  const f = fixture(), auth = await login(f);
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: state(), expectedRevision: 0 } })).status, 200);
  const removed = await f.request('workspace', { ...auth, method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).revision, 2);
  const empty = await (await f.request('workspace', auth)).json();
  assert.equal(empty.state, null);
  assert.equal(empty.revision, 2);
  const next = state(); next.lang = 'es';
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: next, expectedRevision: 2 } })).status, 200);
  assert.equal((await f.request('workspace', { ...auth, method: 'PUT', data: { state: state(), expectedRevision: 1 } })).status, 409);
  assert.equal((await (await f.request('workspace', auth)).json()).state.lang, 'es');
  f.close();
});

test('a cookie changed in another tab cannot return another account’s bytes to the visible account cache', async () => {
  const f = fixture(), a = await login(f), b = await login(f, { sub: 'resident-456', email: 'second@example.org' });
  await f.request(`attachments/${UUID}`, { ...b, method: 'PUT', bytes: new TextEncoder().encode('Second account receipt'), headers: { 'Content-Type': 'text/plain' } });
  const changedCookie = { ...a, cookie: b.cookie, csrf: b.csrf };
  assert.equal((await f.request('workspace', changedCookie)).status, 401);
  assert.equal((await f.request('attachments', changedCookie)).status, 401);
  assert.equal((await f.request(`attachments/${UUID}`, changedCookie)).status, 401);
  assert.equal((await f.request('session', { ...changedCookie, method: 'DELETE' })).status, 401);
  assert.equal((await f.request(`attachments/${UUID}`, b)).status, 200);
  f.close();
});

test('uploads reject unsupported content, path IDs, empty files, excessive sizes and CSRF attacks', async () => {
  const f = fixture(), auth = await login(f);
  const options = { ...auth, method: 'PUT', bytes: new Uint8Array([1]), headers: { 'Content-Type': 'application/pdf' } };
  assert.equal((await f.request('attachments/not-a-uuid', options)).status, 400);
  assert.equal((await f.request(`attachments/${UUID}`, { ...options, csrf: 'bad' })).status, 403);
  assert.equal((await f.request(`attachments/${UUID}`, { ...options, headers: { 'Content-Type': 'text/html' } })).status, 415);
  assert.equal((await f.request(`attachments/${UUID}`, { ...options, bytes: new Uint8Array() })).status, 400);
  assert.equal((await f.request(`attachments/${UUID}`, { ...options, headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(20 * 1024 * 1024 + 1) } })).status, 413);
  assert.equal(f.env.BUCKET.files.size, 0);
  f.close();
});

test('logout revokes the exact session and does not delete saved records or another session', async () => {
  const f = fixture(), auth = await login(f), another = await login(f);
  await f.request('workspace', { ...auth, method: 'PUT', data: { state: state(), expectedRevision: 0 } });
  assert.equal((await f.request('session', { ...auth, method: 'DELETE', csrf: undefined })).status, 403);
  const response = await f.request('session', { ...auth, method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.match(cookies(response)[0], /Max-Age=0/);
  assert.equal((await f.request('workspace', auth)).status, 401);
  assert.equal((await (await f.request('workspace', another)).json()).revision, 1);
  f.close();
});
