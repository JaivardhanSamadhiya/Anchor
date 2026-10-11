/**
 * A fetch-shaped boundary between the local-first workspace and Supabase.
 *
 * account.js owns offline queues, cache separation, and conflict choices. This
 * module only translates its API into authenticated Postgres RPCs and private
 * Storage calls. SQL remains authoritative; validation here gives fast feedback.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  parseAssistantRequest,
  parseAssistantResponse,
  type AssistantResponse,
} from '../domain/program-assistant.ts';

type AuthChange = {
  event: string;
  userId: string | null;
  previousUserId: string | null;
  external: boolean;
};
type Options = {
  client?: SupabaseClient | null;
  googleClientId?: string;
  now?: () => number;
};
type FileRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  status: string;
};
type Workspace = {
  version: 1;
  lang: 'en' | 'es';
  county: 'santa-clara' | 'san-mateo';
  personal: { notices: Record<string, unknown>[]; events: Record<string, unknown>[] };
};
type RPCResult = { data: any; error: any };

const BUCKET = 'anchor-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_STATE_BYTES = 1_500_000;
const CHALLENGE_LIFETIME = 10 * 60 * 1000;
const encoder = new TextEncoder();

class TransportError extends Error {
  status: number;
  detail: Record<string, unknown>;
  constructor(status: number, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function abortIfNeeded(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new DOMException('The account request was canceled.', 'AbortError');
}

/** Race SDK promises against account cancellation even when their HTTP request
 * does not expose AbortSignal. Attach both handlers so late failures stay handled. */
function abortable<T>(operation: PromiseLike<T>, signal?: AbortSignal | null): Promise<T> {
  const pending = Promise.resolve(operation);
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const complete = (action: () => void) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', canceled);
      action();
    };
    const canceled = () =>
      complete(() => reject(new DOMException('The account request was canceled.', 'AbortError')));
    signal.addEventListener('abort', canceled, { once: true });
    pending.then(
      (value) => complete(() => resolve(value)),
      (error) => complete(() => reject(error)),
    );
    if (signal.aborted) canceled();
  });
}
function safeObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedJSON(value: unknown, depth = 0): boolean {
  if (depth > 18) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 500_000;
  if (Array.isArray(value))
    return value.length <= 2000 && value.every((item) => boundedJSON(item, depth + 1));
  if (!safeObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 150 &&
    entries.every(
      ([key, item]) =>
        !['__proto__', 'constructor', 'prototype', 'demo'].includes(key) &&
        key.length <= 100 &&
        !(key === 'isDemo' && item === true) &&
        boundedJSON(item, depth + 1),
    )
  );
}

/** Shared limits are also enforced in Postgres, including requests bypassing this UI. */
export function validateSupabaseWorkspace(value: unknown): value is Workspace {
  if (
    !safeObject(value) ||
    Object.keys(value).some((key) => !['version', 'lang', 'county', 'personal'].includes(key)) ||
    value.version !== 1 ||
    !['en', 'es'].includes(value.lang) ||
    !['santa-clara', 'san-mateo'].includes(value.county)
  )
    return false;
  const personal = value.personal;
  if (
    !safeObject(personal) ||
    Object.keys(personal).some((key) => !['notices', 'events'].includes(key)) ||
    !Array.isArray(personal.notices) ||
    personal.notices.length > 100 ||
    !Array.isArray(personal.events) ||
    personal.events.length > 2000
  )
    return false;
  const noticeIDs = new Set<string>();
  for (const notice of personal.notices) {
    if (
      !safeObject(notice) ||
      typeof notice.id !== 'string' ||
      !notice.id ||
      notice.id.length > 200 ||
      noticeIDs.has(notice.id) ||
      notice.isDemo === true ||
      typeof notice.sourceText !== 'string' ||
      notice.sourceText.length > 500_000 ||
      typeof notice.title !== 'string' ||
      notice.title.length > 500 ||
      !Array.isArray(notice.deadlines) ||
      notice.deadlines.length > 200 ||
      !Array.isArray(notice.requests) ||
      notice.requests.length > 200 ||
      !Array.isArray(notice.warnings) ||
      notice.warnings.length > 200 ||
      (notice.originalAttachmentId != null && !UUID.test(notice.originalAttachmentId))
    )
      return false;
    noticeIDs.add(notice.id);
  }
  for (const event of personal.events) {
    if (
      !safeObject(event) ||
      typeof event.id !== 'string' ||
      !event.id ||
      event.id.length > 200 ||
      typeof event.kind !== 'string' ||
      event.kind.length > 50 ||
      typeof event.title !== 'string' ||
      event.title.length > 2000 ||
      typeof event.date !== 'string' ||
      event.date.length > 50 ||
      (event.attachmentId != null && !UUID.test(event.attachmentId))
    )
      return false;
  }
  return boundedJSON(value) && encoder.encode(JSON.stringify(value)).byteLength <= MAX_STATE_BYTES;
}

function serviceError(error: any): never {
  const message = String(error?.message || '');
  if (
    error?.status === 401 ||
    error?.code === 'PGRST301' ||
    /JWT expired|authentication_required/i.test(message)
  ) {
    throw new TransportError(401, 'Your session ended. Sign in again to continue.');
  }
  if (
    error?.status === 403 ||
    error?.code === '42501' ||
    /account_changed|row.level.security/i.test(message)
  ) {
    throw new TransportError(
      403,
      'The account changed. Sign in to the same account and try again.',
    );
  }
  if (/file_limit|file_too_large/i.test(message))
    throw new TransportError(413, 'Your account has reached its file or upload limit.');
  if (/file_not_found/i.test(message))
    throw new TransportError(404, 'This file was not found in your account.');
  if (/attachment_referenced|attachment_immutable/i.test(message))
    throw new TransportError(
      409,
      'This attachment is in use. Refresh the workspace before changing it.',
    );
  if (
    /invalid_workspace|invalid_attachment|invalid_revision|attachment_not_ready/i.test(message) ||
    error?.code === '23514'
  ) {
    throw new TransportError(
      400,
      'The workspace or attachment is invalid. Review it before syncing.',
    );
  }
  // Do not display raw database errors, SQL text, project tokens, or provider details.
  throw new TransportError(
    503,
    'Account storage could not complete this action. Your device copy is still available.',
  );
}

async function payload(init: RequestInit, limit: number): Promise<any> {
  const headers = new Headers(init.headers);
  if (!(headers.get('Content-Type') || '').startsWith('application/json'))
    throw new TransportError(415, 'Send this action as JSON.');
  const raw = typeof init.body === 'string' ? init.body : '';
  if (encoder.encode(raw).byteLength > limit)
    throw new TransportError(413, 'This upload is too large.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new TransportError(400, 'The request contains invalid JSON.');
  }
}

function publicUser(user: User) {
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    name: String(metadata.full_name || metadata.name || user.email || 'Anchor account').slice(
      0,
      200,
    ),
    email: String(user.email || ''),
  };
}

/**
 * Only the configured Supabase project's public key belongs in the browser.
 * The SDK keeps and refreshes its Supabase session; Google credentials/nonces
 * remain in memory. Database and Storage RLS enforce account ownership.
 *
 * fetch handles the established /api/* contract. onAuthChange callbacks run
 * outside Supabase's auth lock, avoiding deadlocks during cache invalidation.
 */
export function createSupabaseTransport({
  client = null,
  googleClientId = '',
  now = Date.now,
}: Options = {}) {
  const configured = Boolean(client && googleClientId.endsWith('.apps.googleusercontent.com'));
  const listeners = new Set<(event: AuthChange) => void>();
  let challenge: { raw: string; expiresAt: number } | null = null;
  let identity: string | null | undefined;
  let epoch = 0;
  let managedAuth = 0;
  let destroyed = false;
  const subscription = client?.auth.onAuthStateChange((event, session) => {
    const userId = session?.user?.id || null;
    const previousUserId = identity ?? null;
    if (identity !== undefined && identity !== userId) {
      epoch += 1;
      challenge = null;
    }
    identity = userId;
    const change: AuthChange = { event, userId, previousUserId, external: managedAuth === 0 };
    setTimeout(() => {
      if (!destroyed) for (const listener of listeners) listener(change);
    }, 0);
  }).data.subscription;

  async function verifiedUser(
    allowGuest = false,
    signal?: AbortSignal | null,
  ): Promise<User | null> {
    if (!configured || !client) {
      if (allowGuest) return null;
      throw new TransportError(503, 'Google sign-in is not configured for this deployment yet.');
    }
    // getUser verifies with Supabase Auth; a cached getSession identity is not
    // treated as proof that a remote request belongs to the current account.
    abortIfNeeded(signal);
    const { data, error } = await abortable(client.auth.getUser(), signal);
    abortIfNeeded(signal);
    if (error) {
      if (
        allowGuest &&
        (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403)
      )
        return null;
      serviceError(error);
    }
    if (!data.user) {
      if (allowGuest) return null;
      throw new TransportError(401, 'Sign in before opening your account workspace.');
    }
    if (identity !== undefined && identity !== data.user.id) {
      throw new TransportError(
        403,
        'The account changed while verification was running. Try again.',
      );
    }
    return data.user;
  }

  async function rpc(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal | null,
  ): Promise<any> {
    abortIfNeeded(signal);
    let operation = client!.rpc(name, args);
    if (signal) operation = operation.abortSignal(signal);
    const { data, error } = (await abortable(operation, signal)) as RPCResult;
    abortIfNeeded(signal);
    if (error) serviceError(error);
    return data;
  }

  async function listFiles(userId: string, signal?: AbortSignal | null): Promise<FileRecord[]> {
    let query = client!
      .from('anchor_attachments')
      .select('id,name,type,size,path,status')
      .eq('user_id', userId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await abortable(query, signal);
    if (error) serviceError(error);
    return (data || []) as FileRecord[];
  }

  async function fileRecord(
    userId: string,
    id: string,
    signal?: AbortSignal | null,
  ): Promise<FileRecord> {
    let query = client!
      .from('anchor_attachments')
      .select('id,name,type,size,path,status')
      .eq('user_id', userId)
      .eq('id', id)
      .eq('status', 'ready');
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await abortable(query.maybeSingle(), signal);
    if (error) serviceError(error);
    if (!data) throw new TransportError(404, 'This file was not found in your account.');
    return data as FileRecord;
  }

  function ownPath(path: string, userId: string): string {
    // Owner folders are checked again by Storage RLS. No client-supplied path,
    // signed public URL, or service-role credential can bypass that boundary.
    const segments = path.split('/');
    if (
      segments.length !== 3 ||
      segments[0] !== userId ||
      !UUID.test(segments[1]) ||
      !UUID.test(segments[2])
    ) {
      throw new TransportError(403, 'This attachment does not belong to the current account.');
    }
    return path;
  }

  async function deleteReserved(
    file: { id: string; path: string },
    userId: string,
    signal?: AbortSignal | null,
  ) {
    const path = ownPath(file.path, userId);
    abortIfNeeded(signal);
    const { error } = await abortable(client!.storage.from(BUCKET).remove([path]), signal);
    if (error) serviceError(error);
    abortIfNeeded(signal);
    await rpc(
      'anchor_finish_attachment_delete',
      { p_account_id: userId, p_id: file.id, p_path: path },
      signal,
    );
  }

  async function handle(path: string, init: RequestInit): Promise<Response> {
    const method = (init.method || 'GET').toUpperCase();
    const signal = init.signal;
    const headers = new Headers(init.headers);
    abortIfNeeded(signal);

    if (path === '/api/account') {
      if (method !== 'GET') throw new TransportError(405, 'This action is not supported.');
      const user = await verifiedUser(true, signal);
      abortIfNeeded(signal);
      return json({
        configured,
        authenticated: Boolean(user),
        user: user ? publicUser(user) : null,
        // Compatibility marker only: SDK requests use bearer authentication,
        // not cookies, so cookie-CSRF validation is not this backend's mechanism.
        csrfToken: user ? 'supabase-bearer-session' : null,
        googleClientId: configured ? googleClientId : null,
      });
    }
    if (path === '/api/auth/challenge') {
      if (method !== 'GET') throw new TransportError(405, 'This action is not supported.');
      if (!configured)
        throw new TransportError(503, 'Google sign-in is not configured for this deployment yet.');
      const raw = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
      challenge = { raw, expiresAt: now() + CHALLENGE_LIFETIME };
      return json({
        nonce: [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      });
    }
    if (path === '/api/auth/google') {
      if (method !== 'POST') throw new TransportError(405, 'This action is not supported.');
      const body = await payload(init, 20_000);
      const pending = challenge;
      challenge = null; // A retry must request a fresh nonce.
      if (!configured || !pending || pending.expiresAt <= now())
        throw new TransportError(401, 'Sign-in expired. Open the Google sign-in button again.');
      if (!safeObject(body) || typeof body.credential !== 'string' || !body.credential)
        throw new TransportError(400, 'Google did not return a sign-in credential.');
      managedAuth += 1;
      try {
        const { data, error } = await abortable(
          client!.auth.signInWithIdToken({
            provider: 'google',
            token: body.credential,
            nonce: pending.raw,
          }),
          signal,
        );
        if (error || !data.user)
          throw new TransportError(401, 'Google sign-in could not be verified. Try again.');
        return json({ authenticated: true, user: publicUser(data.user) });
      } finally {
        managedAuth -= 1;
      }
    }

    const user = await verifiedUser(false, signal);
    abortIfNeeded(signal);
    const userId = user!.id;
    const operationEpoch = epoch;
    const expectedAccount = headers.get('X-Anchor-Account');
    if (expectedAccount && expectedAccount !== userId)
      throw new TransportError(
        403,
        'The account changed. Sign in to the same account and try again.',
      );
    const assertCurrent = () => {
      abortIfNeeded(signal);
      if (epoch !== operationEpoch || (identity !== undefined && identity !== userId))
        throw new TransportError(
          403,
          'The account changed while this action was running. Try again.',
        );
    };
    if (path === '/api/session') {
      if (method !== 'DELETE') throw new TransportError(405, 'This action is not supported.');
      managedAuth += 1;
      try {
        const { error } = await abortable(client!.auth.signOut({ scope: 'local' }), signal);
        if (error) serviceError(error);
        return json({ signedOut: true });
      } finally {
        managedAuth -= 1;
      }
    }
    if (path === '/api/workspace') {
      if (method === 'GET') {
        let query = client!
          .from('anchor_workspaces')
          .select('state,revision')
          .eq('user_id', userId);
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await abortable(query.maybeSingle(), signal);
        if (error) serviceError(error);
        assertCurrent();
        return json(data || { state: null, revision: 0 });
      }
      if (method === 'PUT') {
        const body = await payload(init, MAX_STATE_BYTES + 1000);
        if (
          !safeObject(body) ||
          Object.keys(body).some((key) => !['state', 'expectedRevision'].includes(key)) ||
          !Number.isSafeInteger(body.expectedRevision) ||
          body.expectedRevision < 0 ||
          !validateSupabaseWorkspace(body.state)
        ) {
          throw new TransportError(400, 'The workspace is invalid. Review it before syncing.');
        }
        const result = await rpc(
          'anchor_save_workspace',
          { p_account_id: userId, p_state: body.state, p_expected_revision: body.expectedRevision },
          signal,
        );
        assertCurrent();
        if (result.conflict)
          return json(
            { error: 'Another device changed this workspace.', revision: result.revision },
            409,
          );
        return json(result);
      }
      if (method === 'DELETE') {
        // Tombstone and mark old files in one SQL transaction. Cleanup removes
        // those exact paths; another device's later upload cannot be deleted.
        const result = await rpc('anchor_clear_workspace', { p_account_id: userId }, signal);
        for (const file of result.files || []) {
          assertCurrent();
          await deleteReserved(file, userId, signal);
        }
        assertCurrent();
        return json({ deleted: true, revision: result.revision });
      }
      throw new TransportError(405, 'This action is not supported.');
    }
    if (path === '/api/attachments') {
      if (method !== 'GET') throw new TransportError(405, 'This action is not supported.');
      const files = await listFiles(userId, signal);
      assertCurrent();
      return json({
        attachments: files.map(({ id, name, type, size }) => ({ id, name, type, size })),
      });
    }
    if (!path.startsWith('/api/attachments/'))
      throw new TransportError(404, 'This account action was not found.');
    const id = path.slice('/api/attachments/'.length);
    if (!UUID.test(id)) throw new TransportError(400, 'The file identifier is invalid.');

    if (method === 'GET') {
      const file = await fileRecord(userId, id, signal);
      assertCurrent();
      const { data, error } = await abortable(
        client!.storage.from(BUCKET).download(ownPath(file.path, userId)),
        signal,
      );
      if (error) serviceError(error);
      assertCurrent();
      if (!data) throw new TransportError(404, 'This file was not found in your account.');
      return new Response(data, {
        headers: {
          'Content-Type': file.type,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (method === 'PUT') {
      const type = (headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!FILE_TYPES.has(type))
        throw new TransportError(415, 'Upload a PDF, supported image, or plain text file.');
      const blob =
        init.body instanceof Blob ? init.body : new Blob([init.body as BlobPart], { type });
      if (!blob.size) throw new TransportError(400, 'This file is empty.');
      if (blob.size > MAX_FILE_BYTES) throw new TransportError(413, 'This upload is too large.');
      let name: string;
      try {
        name = decodeURIComponent(headers.get('X-Anchor-Filename') || 'document');
      } catch {
        throw new TransportError(400, 'The file name is invalid.');
      }
      name =
        name
          .normalize('NFC')
          .replace(/[\x00-\x1f\x7f/\\]/g, '-')
          .trim()
          .slice(0, 180) || 'document';
      const reservation = await rpc(
        'anchor_reserve_attachment',
        { p_account_id: userId, p_id: id, p_name: name, p_type: type, p_size: blob.size },
        signal,
      );
      assertCurrent();
      if (reservation.status !== 'ready') {
        const { error } = await abortable(
          client!.storage.from(BUCKET).upload(ownPath(reservation.path, userId), blob, {
            contentType: type,
            upsert: true,
            cacheControl: '0',
          }),
          signal,
        );
        if (error) serviceError(error);
        assertCurrent();
        await rpc(
          'anchor_commit_attachment',
          { p_account_id: userId, p_id: id, p_path: reservation.path },
          signal,
        );
      }
      assertCurrent();
      return json({ attachment: { id, name, type, size: blob.size } });
    }
    if (method === 'DELETE') {
      const file = await rpc(
        'anchor_begin_attachment_delete',
        { p_account_id: userId, p_id: id },
        signal,
      );
      assertCurrent();
      await deleteReserved(file, userId, signal);
      assertCurrent();
      return json({ deleted: true });
    }
    throw new TransportError(405, 'This action is not supported.');
  }

  const requestFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    let path: string;
    if (input instanceof Request) {
      path = new URL(input.url).pathname;
      init = { method: input.method, headers: input.headers, signal: input.signal, ...init };
    } else {
      path = String(input).startsWith('/api/')
        ? String(input)
        : new URL(String(input), 'https://anchor.invalid').pathname;
    }
    try {
      return await handle(path.replace(/\/$/, ''), init);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      if (error instanceof TransportError)
        return json({ error: error.message, ...error.detail }, error.status);
      return json(
        { error: 'Account storage is unavailable. Your device copy is still available.' },
        503,
      );
    }
  };

  return {
    fetch: requestFetch,
    async askProgram(value: unknown, signal?: AbortSignal): Promise<AssistantResponse> {
      const request = parseAssistantRequest(value);
      if (!request) throw new Error('Choose a public program topic before asking Gemini.');
      const start = epoch;
      const user = await verifiedUser(false, signal);
      abortIfNeeded(signal);
      if (start !== epoch || (identity !== undefined && identity !== user?.id))
        throw new Error('The account changed. Ask again after signing in.');
      const { data, error } = await abortable(
        client!.functions.invoke('anchor-assistant', { body: request }),
        signal,
      );
      abortIfNeeded(signal);
      if (start !== epoch || (identity !== undefined && identity !== user?.id))
        throw new Error('The account changed. This answer was discarded.');
      if (error) {
        const status = error.context?.status;
        if (status === 404)
          throw new Error(
            'The Gemini endpoint has not been deployed yet. Official source guidance is available.',
          );
        if (status === 429)
          throw new Error(
            'The AI request limit was reached. Try again later or use official source guidance.',
          );
        if (status === 401 || status === 403)
          throw new Error('Reconnect and sign in again to use Gemini.');
        throw new Error('Gemini is unavailable. The private notice workspace is still available.');
      }
      const answer = parseAssistantResponse(data, request);
      if (!answer)
        throw new Error('The AI answer could not be verified against the approved sources.');
      return answer;
    },
    onAuthChange(listener: (event: AuthChange) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      subscription?.unsubscribe();
    },
  };
}

/** Build-time settings are public identifiers; never include a service-role key. */
export function createConfiguredSupabaseTransport(settings: {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  googleClientId?: string;
  configured?: boolean;
}) {
  const enabled = Boolean(
    settings.supabaseUrl &&
    settings.supabasePublishableKey &&
    settings.googleClientId &&
    settings.configured !== false,
  );
  const client = enabled
    ? createClient(settings.supabaseUrl!, settings.supabasePublishableKey!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  return createSupabaseTransport({ client, googleClientId: settings.googleClientId });
}
