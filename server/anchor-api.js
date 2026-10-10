import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_COOKIE = '__Host-anchor_session';
const CHALLENGE_COOKIE = '__Host-anchor_challenge';
const CHALLENGE_AGE = 10 * 60;
const SESSION_AGE = 30 * 24 * 60 * 60;
const MAX_STATE_BYTES = 1_500_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_TYPES = new Set(['application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff']);
const encoder = new TextEncoder();

class APIError extends Error {
  constructor(status, message, detail = {}) { super(message); this.status = status; this.detail = detail; }
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  });
}

function cookie(name, value, age) {
  return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=${name === CHALLENGE_COOKIE ? 'Strict' : 'Lax'}`;
}

function cookieValue(request, name) {
  const matches = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).filter((s) => s.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenHash(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function originCheck(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new APIError(403, 'This action must come from Anchor.');
  }
}

async function bodyBytes(request, limit) {
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new APIError(413, 'This upload is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new APIError(413, 'This upload is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function bodyJSON(request, limit) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new APIError(415, 'Send this action as JSON.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bodyBytes(request, limit))); }
  catch (error) { if (error instanceof APIError) throw error; throw new APIError(400, 'The request contains invalid JSON.'); }
}

function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function boundedJSON(value, depth = 0) {
  if (depth > 18) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 500_000;
  if (Array.isArray(value)) return value.length <= 2000 && value.every((item) => boundedJSON(item, depth + 1));
  if (!plainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 150 && entries.every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && key.length <= 100 && boundedJSON(item, depth + 1));
}

export function validateWorkspace(value) {
  if (!plainObject(value) || Object.keys(value).some((key) => !['version', 'lang', 'county', 'personal'].includes(key)) || value.version !== 1 || !['en', 'es'].includes(value.lang) || !['santa-clara', 'san-mateo'].includes(value.county)) return false;
  const personal = value.personal;
  if (!plainObject(personal) || Object.keys(personal).some((key) => !['notices', 'events'].includes(key)) || !Array.isArray(personal.notices) || personal.notices.length > 100 || !Array.isArray(personal.events) || personal.events.length > 2000) return false;
  const noticeIDs = new Set();
  for (const notice of personal.notices) {
    if (!plainObject(notice) || typeof notice.id !== 'string' || !notice.id || notice.id.length > 200 || noticeIDs.has(notice.id) || notice.isDemo === true || typeof notice.sourceText !== 'string' || notice.sourceText.length > 500_000 || typeof notice.title !== 'string' || notice.title.length > 500 || !Array.isArray(notice.deadlines) || notice.deadlines.length > 200 || !Array.isArray(notice.requests) || notice.requests.length > 200 || !Array.isArray(notice.warnings) || notice.warnings.length > 200) return false;
    noticeIDs.add(notice.id);
    for (const key of ['originalAttachmentId']) if (notice[key] != null && !UUID.test(notice[key])) return false;
  }
  for (const event of personal.events) {
    if (!plainObject(event) || typeof event.id !== 'string' || !event.id || event.id.length > 200 || typeof event.kind !== 'string' || event.kind.length > 50 || typeof event.title !== 'string' || event.title.length > 2000 || typeof event.date !== 'string' || event.date.length > 50) return false;
    if (event.attachmentId != null && !UUID.test(event.attachmentId)) return false;
  }
  return boundedJSON(value) && encoder.encode(JSON.stringify(value)).byteLength <= MAX_STATE_BYTES;
}

function requireDB(env) { if (!env.DB) throw new APIError(503, 'Account storage is not ready yet.'); return env.DB; }
function requireBucket(env) { if (!env.BUCKET) throw new APIError(503, 'File storage is not ready yet.'); return env.BUCKET; }

async function currentSession(request, db, now) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await tokenHash(token);
  const row = await db.prepare('SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at, u.name, u.email FROM anchor_sessions s JOIN anchor_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash, now).first();
  return row || null;
}

function requireWrite(request, session) {
  originCheck(request);
  if (!equalSecret(request.headers.get('X-Anchor-CSRF'), session.csrf_token)) throw new APIError(403, 'Please refresh Anchor before trying this action.');
}

function accountUser(session) { return { id: session.user_id, name: session.name, email: session.email }; }

function fileName(request) {
  let value;
  try { value = decodeURIComponent(request.headers.get('X-Anchor-Filename') || 'document'); }
  catch { throw new APIError(400, 'The file name is invalid.'); }
  value = value.normalize('NFC').replace(/[\x00-\x1f\x7f/\\]/g, '-').trim().slice(0, 180);
  return value || 'document';
}

function methodNotAllowed() { throw new APIError(405, 'This action is not supported.'); }

/** options.jwks allows real signed JWT fixtures in tests; every token still runs jwtVerify. */
export function createAnchorAPI({ jwks = GOOGLE_KEYS, now = Date.now } = {}) {
  return async function handle(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '');
      const timestamp = now();
      const configured = Boolean(env.GOOGLE_CLIENT_ID && /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID));
      if (path === '/api/account') {
        if (request.method !== 'GET') methodNotAllowed();
        const session = env.DB ? await currentSession(request, env.DB, timestamp) : null;
        return json({ configured, authenticated: Boolean(session), user: session ? accountUser(session) : null, csrfToken: session?.csrf_token || null, googleClientId: configured ? env.GOOGLE_CLIENT_ID : null });
      }
      if (path === '/api/auth/challenge') {
        if (request.method !== 'GET') methodNotAllowed();
        if (!configured) throw new APIError(503, 'Google sign-in has not been connected yet.');
        if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new APIError(403, 'Start sign-in from Anchor.');
        const db = requireDB(env);
        const token = randomToken(), nonce = randomToken();
        await db.batch([
          db.prepare('DELETE FROM anchor_auth_challenges WHERE expires_at<=?').bind(timestamp),
          db.prepare('INSERT INTO anchor_auth_challenges (token_hash,nonce,expires_at) VALUES (?,?,?)').bind(await tokenHash(token), nonce, timestamp + CHALLENGE_AGE * 1000),
        ]);
        return json({ nonce }, 200, { 'Set-Cookie': cookie(CHALLENGE_COOKIE, token, CHALLENGE_AGE) });
      }
      if (path === '/api/auth/google') {
        if (request.method !== 'POST') methodNotAllowed();
        originCheck(request);
        if (!configured) throw new APIError(503, 'Google sign-in has not been connected yet.');
        const db = requireDB(env);
        const challengeToken = cookieValue(request, CHALLENGE_COOKIE);
        if (!challengeToken) throw new APIError(401, 'Start Google sign-in again.');
        const challengeHash = await tokenHash(challengeToken);
        const challenge = await db.prepare('SELECT nonce FROM anchor_auth_challenges WHERE token_hash=? AND expires_at>?').bind(challengeHash, timestamp).first();
        if (!challenge) throw new APIError(401, 'This sign-in attempt has expired. Start again.');
        const body = await bodyJSON(request, 20_000);
        if (!plainObject(body) || Object.keys(body).some((key) => key !== 'credential')) throw new APIError(400, 'The sign-in request is invalid.');
        const { credential } = body;
        if (typeof credential !== 'string' || credential.length > 16_000) throw new APIError(400, 'The sign-in credential is invalid.');
        let claims;
        try {
          ({ payload: claims } = await jwtVerify(credential, jwks, { algorithms: ['RS256'], audience: env.GOOGLE_CLIENT_ID, issuer: ['https://accounts.google.com', 'accounts.google.com'], clockTolerance: 5, currentDate: new Date(timestamp), requiredClaims: ['sub', 'exp', 'iat', 'nonce'] }));
        } catch { throw new APIError(401, 'Google could not verify this sign-in. Please try again.'); }
        if (!equalSecret(claims.nonce, challenge.nonce) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.email !== 'string' || !claims.email || claims.email.length > 320 || claims.email_verified !== true) throw new APIError(401, 'Google could not verify this sign-in. Please try again.');
        const consumed = await db.prepare('DELETE FROM anchor_auth_challenges WHERE token_hash=? AND expires_at>? RETURNING nonce').bind(challengeHash, timestamp).first();
        if (!consumed) throw new APIError(401, 'This sign-in attempt has already been used. Start again.');
        const userId = `google:${claims.sub}`;
        const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 200) : claims.email;
        const token = randomToken(), csrf = randomToken();
        await db.batch([
          db.prepare('INSERT INTO anchor_users (id,name,email,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at').bind(userId, name, claims.email, timestamp),
          db.prepare('DELETE FROM anchor_sessions WHERE expires_at<=?').bind(timestamp),
          db.prepare('INSERT INTO anchor_sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)').bind(await tokenHash(token), userId, csrf, timestamp + SESSION_AGE * 1000),
        ]);
        const headers = new Headers({ 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_AGE));
        headers.append('Set-Cookie', cookie(CHALLENGE_COOKIE, '', 0));
        return new Response(JSON.stringify({ configured: true, authenticated: true, user: { id: userId, name, email: claims.email }, csrfToken: csrf, googleClientId: env.GOOGLE_CLIENT_ID }), { status: 200, headers });
      }
      if (!['/api/session', '/api/workspace', '/api/attachments'].includes(path) && !path.startsWith('/api/attachments/')) throw new APIError(404, 'This page was not found.');
      const db = requireDB(env);
      const session = await currentSession(request, db, timestamp);
      if (!session) throw new APIError(401, 'Sign in to access your saved information.');
      const userId = session.user_id;
      // A second tab can change the HttpOnly account cookie. Pin requests to
      // the account currently displayed before returning any private data.
      const expectedAccount = request.headers.get('X-Anchor-Account');
      if (expectedAccount && expectedAccount !== userId) throw new APIError(401, 'The signed-in account changed. Refresh Anchor before accessing saved information.');
      if (!['GET', 'HEAD'].includes(request.method)) requireWrite(request, session);
      if (path === '/api/session') {
        if (request.method !== 'DELETE') methodNotAllowed();
        await db.prepare('DELETE FROM anchor_sessions WHERE token_hash=?').bind(session.token_hash).run();
        return json({ authenticated: false }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
      }
      if (path === '/api/workspace') {
        if (request.method === 'GET') {
          const row = await db.prepare('SELECT state_json,revision,updated_at FROM anchor_workspaces WHERE user_id=?').bind(userId).first();
          return json({ state: row ? JSON.parse(row.state_json) : null, revision: row?.revision || 0, updatedAt: row?.updated_at || null });
        }
        if (request.method === 'PUT') {
          const body = await bodyJSON(request, MAX_STATE_BYTES + 200);
          if (!plainObject(body) || Object.keys(body).some((key) => !['state', 'expectedRevision'].includes(key)) || !validateWorkspace(body.state) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 1_000_000_000) throw new APIError(400, 'The workspace format is invalid. Practice data stays on this device.');
          const nextRevision = body.expectedRevision + 1;
          const stateJSON = JSON.stringify(body.state);
          const result = body.expectedRevision === 0
            ? await db.prepare('INSERT INTO anchor_workspaces (user_id,state_json,revision,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(userId, stateJSON, nextRevision, timestamp).run()
            : await db.prepare('UPDATE anchor_workspaces SET state_json=?,revision=?,updated_at=? WHERE user_id=? AND revision=?').bind(stateJSON, nextRevision, timestamp, userId, body.expectedRevision).run();
          if (!result.meta?.changes) {
            const row = await db.prepare('SELECT revision FROM anchor_workspaces WHERE user_id=?').bind(userId).first();
            throw new APIError(409, 'This workspace changed on another device. Review the saved version before updating it.', { revision: row?.revision || 0 });
          }
          return json({ revision: nextRevision, updatedAt: timestamp });
        }
        if (request.method === 'DELETE') {
          const bucket = requireBucket(env);
          const files = await db.prepare('SELECT object_key FROM anchor_attachments WHERE user_id=?').bind(userId).all();
          for (const file of files.results || []) await bucket.delete(file.object_key);
          const deleted = await db.batch([
            db.prepare('DELETE FROM anchor_attachments WHERE user_id=?').bind(userId),
            // Keep a null-state revision tombstone so an old device cannot
            // overwrite new work after delete/recreate by reusing a revision.
            db.prepare("INSERT INTO anchor_workspaces (user_id,state_json,revision,updated_at) VALUES (?,'null',1,?) ON CONFLICT(user_id) DO UPDATE SET state_json='null',revision=anchor_workspaces.revision+1,updated_at=excluded.updated_at RETURNING revision").bind(userId, timestamp),
          ]);
          return json({ deleted: true, revision: deleted[1].results[0].revision });
        }
        methodNotAllowed();
      }
      if (path === '/api/attachments') {
        if (request.method !== 'GET') methodNotAllowed();
        const files = await db.prepare('SELECT id,name,type,size FROM anchor_attachments WHERE user_id=? ORDER BY updated_at DESC').bind(userId).all();
        return json({ attachments: files.results || [] });
      }
      const fileId = path.slice('/api/attachments/'.length);
      if (!UUID.test(fileId)) throw new APIError(400, 'The file identifier is invalid.');
      const bucket = requireBucket(env);
      const existing = await db.prepare('SELECT object_key,name,type,size FROM anchor_attachments WHERE user_id=? AND id=?').bind(userId, fileId).first();
      if (request.method === 'GET') {
        if (!existing) throw new APIError(404, 'This file was not found in your account.');
        const object = await bucket.get(existing.object_key);
        if (!object) throw new APIError(404, 'This file was not found in your account.');
        const fallbackName = existing.name.replace(/[^\x20-\x7e]|["\\]/g, '_');
        return new Response(object.body, { headers: { 'Content-Type': existing.type, 'Content-Length': String(existing.size), 'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(existing.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (request.method === 'PUT') {
        const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!FILE_TYPES.has(type)) throw new APIError(415, 'Upload a PDF, supported image, or plain text file.');
        if (!existing) {
          const count = await db.prepare('SELECT COUNT(*) AS count FROM anchor_attachments WHERE user_id=?').bind(userId).first();
          if (count.count >= MAX_FILES) throw new APIError(413, 'Your account has reached its 200-file limit.');
        }
        const bytes = await bodyBytes(request, MAX_FILE_BYTES);
        if (!bytes.byteLength) throw new APIError(400, 'This file is empty.');
        const name = fileName(request);
        const objectKey = `accounts/${await tokenHash(userId)}/${crypto.randomUUID()}`;
        await bucket.put(objectKey, bytes, { httpMetadata: { contentType: type } });
        try {
          await db.prepare('INSERT INTO anchor_attachments (user_id,id,object_key,name,type,size,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET object_key=excluded.object_key,name=excluded.name,type=excluded.type,size=excluded.size,updated_at=excluded.updated_at').bind(userId, fileId, objectKey, name, type, bytes.byteLength, timestamp).run();
        } catch (error) { await bucket.delete(objectKey); throw error; }
        if (existing?.object_key) await bucket.delete(existing.object_key);
        return json({ attachment: { id: fileId, name, type, size: bytes.byteLength } });
      }
      if (request.method === 'DELETE') {
        if (!existing) throw new APIError(404, 'This file was not found in your account.');
        await bucket.delete(existing.object_key);
        await db.prepare('DELETE FROM anchor_attachments WHERE user_id=? AND id=?').bind(userId, fileId).run();
        return json({ deleted: true });
      }
      methodNotAllowed();
    } catch (error) {
      if (error instanceof APIError) return json({ error: error.message, ...error.detail }, error.status);
      return json({ error: 'Anchor could not complete this action. Please try again.' }, 503);
    }
  };
}

export const handleAnchorRequest = createAnchorAPI();
