/**
 * Optional Google Calendar authorization uses GIS's browser token model. Tokens
 * live only in this closure; no refresh token or Calendar credential is stored.
 * Requests create a confirmed event in the chosen Google account's primary
 * calendar. They never list existing events or overwrite a resident's edits.
 * https://developers.google.com/identity/oauth2/web/guides/use-token-model
 * https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
 */
import { validDate } from '../domain/continuity.js';
import { nextCalendarDay, type CalendarEventPayload } from '../domain/google-calendar.js';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
export const GOOGLE_CALENDAR_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
}
interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}
interface GoogleAuthorization {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    prompt: string;
    callback(response: GoogleTokenResponse): void;
    error_callback(error: { type?: string }): void;
  }): GoogleTokenClient;
  hasGrantedAllScopes?(response: GoogleTokenResponse, scope: string): boolean;
}
export interface GoogleCalendarIdentity {
  accounts?: { oauth2?: GoogleAuthorization };
}
export interface CalendarClientOptions {
  clientId: string;
  getGoogle?: () => GoogleCalendarIdentity | undefined;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}
export interface CalendarAddResult {
  id: string;
  status: 'added' | 'already-added';
  /** Returned only from successful insertion; no extra read is made on duplicates. */
  url?: string;
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}

function eventPayload(event: CalendarEventPayload): CalendarEventPayload {
  if (
    !event ||
    !/^[a-v0-9]{5,1024}$/.test(event.id) ||
    !validDate(event.start?.date) ||
    event.end?.date !== nextCalendarDay(event.start.date) ||
    typeof event.summary !== 'string' ||
    !event.summary.trim() ||
    event.summary.length > 300 ||
    typeof event.description !== 'string' ||
    event.description.length > 2000
  )
    throw new GoogleCalendarError('Review the event preview before adding it.', 'invalid-event');
  // Construct an allowlisted body, rather than forwarding arbitrary attachments,
  // attendees, case metadata, or other properties added by an untrusted caller.
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: { date: event.start.date },
    end: { date: event.end.date },
    visibility: 'private',
    transparency: 'transparent',
    reminders: { useDefault: true },
  };
}

export function createCalendarClient({
  clientId,
  getGoogle = () => (globalThis as typeof globalThis & { google?: GoogleCalendarIdentity }).google,
  fetch: request = globalThis.fetch,
  now = () => Date.now(),
}: CalendarClientOptions) {
  let token: { value: string; expiresAt: number } | null = null;
  let generation = 0;
  let connecting: Promise<void> | null = null;
  let preparing: Promise<void> | null = null;
  let cancelConnect: (() => void) | null = null;
  const pendingRequests = new Set<AbortController>();
  const connected = () => Boolean(token && token.expiresAt > now() + 30_000);

  function prepare(): Promise<void> {
    if (getGoogle()?.accounts?.oauth2?.initTokenClient) return Promise.resolve();
    if (preparing) return preparing;
    if (typeof document === 'undefined')
      return Promise.reject(
        new GoogleCalendarError('Google Calendar needs an online browser.', 'library-unavailable'),
      );
    const promise = new Promise<void>((resolve, reject) => {
      const existing = [...document.scripts].find(
        (script) => script.src === GOOGLE_IDENTITY_SCRIPT,
      );
      const script = existing || document.createElement('script');
      const owned = !existing;
      let finished = false;
      const timeout = setTimeout(() => complete(false), 15_000);
      function complete(success: boolean) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
        if (success && getGoogle()?.accounts?.oauth2?.initTokenClient) resolve();
        else {
          if (owned) script.remove();
          reject(
            new GoogleCalendarError(
              'Google’s Calendar library could not load. Reconnect and open Calendar again.',
              'library-unavailable',
            ),
          );
        }
      }
      function loaded() {
        complete(true);
      }
      function failed() {
        complete(false);
      }
      // Reuse a pending sign-in script without replacing its onload/onerror
      // handlers. Loading GIS never opens a consent popup or obtains a token.
      script.addEventListener('load', loaded);
      script.addEventListener('error', failed);
      if (owned) {
        script.src = GOOGLE_IDENTITY_SCRIPT;
        script.async = true;
        script.defer = true;
        document.head.append(script);
      }
    });
    preparing = promise;
    void promise.then(
      () => {
        if (preparing === promise) preparing = null;
      },
      () => {
        if (preparing === promise) preparing = null;
      },
    );
    return promise;
  }

  function clear() {
    generation++;
    token = null;
    cancelConnect?.();
    cancelConnect = null;
    connecting = null;
    for (const controller of pendingRequests) controller.abort();
    pendingRequests.clear();
  }

  function connect(): Promise<void> {
    if (connected()) return Promise.resolve();
    if (connecting) return connecting;
    token = null;
    if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
      return Promise.reject(
        new GoogleCalendarError(
          'Google Calendar needs a configured Web client ID.',
          'configuration',
        ),
      );
    const google = getGoogle()?.accounts?.oauth2;
    if (!google?.initTokenClient)
      return Promise.reject(
        new GoogleCalendarError(
          'Google’s sign-in library is still loading. Try Connect Calendar again while online.',
          'library-unavailable',
        ),
      );
    if (
      typeof navigator !== 'undefined' &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    )
      return Promise.reject(
        new GoogleCalendarError(
          'Click Connect Calendar to grant permission.',
          'user-gesture-required',
        ),
      );
    const started = generation;
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      function finish(error?: GoogleCalendarError) {
        if (settled) return;
        settled = true;
        cancelConnect = null;
        if (error) reject(error);
        else resolve();
      }
      cancelConnect = () =>
        finish(
          new GoogleCalendarError(
            'Calendar was disconnected. Connect again to continue.',
            'disconnected',
          ),
        );
      try {
        const client = google.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_CALENDAR_SCOPE,
          include_granted_scopes: false,
          prompt: 'select_account',
          callback(response) {
            if (settled || generation !== started) return;
            if (response.error || !response.access_token) {
              finish(
                new GoogleCalendarError(
                  response.error === 'access_denied'
                    ? 'Calendar permission was declined. You can still download an .ics reminder.'
                    : 'Google could not connect Calendar. Try again or download an .ics reminder.',
                  response.error || 'authorization-failed',
                ),
              );
              return;
            }
            const explicitScope = (response.scope || '')
              .split(/\s+/)
              .includes(GOOGLE_CALENDAR_SCOPE);
            const granted = google.hasGrantedAllScopes
              ? google.hasGrantedAllScopes(response, GOOGLE_CALENDAR_SCOPE)
              : explicitScope;
            if (!explicitScope || !granted) {
              finish(
                new GoogleCalendarError(
                  'Calendar permission was not granted. Connect again and approve the Calendar option, or download an .ics reminder.',
                  'scope-denied',
                ),
              );
              return;
            }
            const lifetime = Number(response.expires_in);
            if (!Number.isFinite(lifetime) || lifetime <= 30) {
              finish(
                new GoogleCalendarError(
                  'Calendar permission expired. Connect again.',
                  'token-expired',
                ),
              );
              return;
            }
            token = { value: response.access_token, expiresAt: now() + lifetime * 1000 };
            finish();
          },
          error_callback(error) {
            finish(
              new GoogleCalendarError(
                error.type === 'popup_failed_to_open'
                  ? 'Allow Google’s popup for Anchor, then click Connect Calendar again.'
                  : error.type === 'popup_closed'
                    ? 'Calendar connection was canceled. Your Anchor workspace is unchanged.'
                    : 'Google’s Calendar popup could not finish. Try again while online.',
                error.type || 'popup-error',
              ),
            );
          },
        });
        // Keep this synchronous with the click handler: GIS may only open its
        // account/consent popup in response to a resident's gesture.
        client.requestAccessToken({ prompt: 'select_account' });
      } catch {
        finish(
          new GoogleCalendarError(
            'Google Calendar could not open. Try Connect Calendar again.',
            'popup-error',
          ),
        );
      }
    });
    connecting = promise;
    void promise.then(
      () => {
        if (connecting === promise) connecting = null;
      },
      () => {
        if (connecting === promise) connecting = null;
      },
    );
    return promise;
  }

  async function add(event: CalendarEventPayload): Promise<CalendarAddResult> {
    const payload = eventPayload(event);
    if (!connected() || !token) {
      token = null;
      throw new GoogleCalendarError(
        'Connect Calendar again, then confirm which reminders to add.',
        'token-expired',
      );
    }
    const started = generation;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    pendingRequests.add(controller);
    try {
      const response = await request(GOOGLE_CALENDAR_EVENTS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        signal: controller.signal,
      });
      if (generation !== started)
        throw new GoogleCalendarError(
          'Calendar was disconnected. Check Calendar before retrying.',
          'disconnected',
        );
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) return { id: payload.id, status: 'already-added' };
      if (response.status === 401) {
        token = null;
        throw new GoogleCalendarError(
          'Google Calendar permission expired. Connect again.',
          'token-expired',
        );
      }
      if (!response.ok) {
        const reasons = (body.error?.errors || []).map(
          (error: { reason?: string }) => error.reason,
        );
        const details = (body.error?.details || []).map((item: { reason?: string }) => item.reason);
        if (reasons.includes('accessNotConfigured') || details.includes('SERVICE_DISABLED'))
          throw new GoogleCalendarError(
            'The project owner needs to enable Google Calendar API in Google Cloud. You can download an .ics reminder meanwhile.',
            'api-disabled',
          );
        if (
          response.status === 403 &&
          !reasons.includes('rateLimitExceeded') &&
          !reasons.includes('userRateLimitExceeded')
        )
          throw new GoogleCalendarError(
            'Google denied Calendar access. Check the Calendar permission and OAuth test-user settings, or download an .ics reminder.',
            'access-denied',
          );
        if (
          response.status === 429 ||
          response.status >= 500 ||
          reasons.some((reason: string) => /rateLimit/i.test(reason || ''))
        )
          throw new GoogleCalendarError(
            'Google Calendar is temporarily unavailable. Retry later; existing reminders will not be duplicated.',
            'temporarily-unavailable',
          );
        throw new GoogleCalendarError(
          'Google Calendar could not add this reminder. Review the date or download an .ics file.',
          'calendar-error',
        );
      }
      let url: string | undefined;
      if (typeof body.htmlLink === 'string') {
        try {
          const link = new URL(body.htmlLink);
          if (link.protocol === 'https:' && link.hostname === 'calendar.google.com')
            url = link.href;
        } catch {
          /* Only a valid Google Calendar link can be exposed to the UI. */
        }
      }
      return { id: payload.id, status: 'added', ...(url ? { url } : {}) };
    } catch (error) {
      if (error instanceof GoogleCalendarError) throw error;
      throw new GoogleCalendarError(
        controller.signal.aborted
          ? 'Calendar connection ended or timed out. Check Calendar before retrying.'
          : 'Could not reach Google Calendar. Retry while online; existing reminders will not be duplicated.',
        controller.signal.aborted ? 'request-interrupted' : 'network-error',
      );
    } finally {
      clearTimeout(timeout);
      pendingRequests.delete(controller);
    }
  }

  return {
    prepare,
    connect,
    add,
    async addEvents(events: readonly CalendarEventPayload[]): Promise<CalendarAddResult[]> {
      const results: CalendarAddResult[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        results.push(await add(event));
      }
      return results;
    },
    clear,
    // Forgetting this page's token is separate from revoking Google's app grant,
    // which would also revoke the site's Google sign-in scopes for this client.
    disconnect: clear,
    get connected() {
      return connected();
    },
  };
}
