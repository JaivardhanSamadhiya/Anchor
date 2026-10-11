import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { analyzeNotice } from '../web/engine.js';

async function loadSource(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
}
const { getCalendarCandidates, createCalendarEvent, nextCalendarDay } = await loadSource(
  'src/domain/google-calendar.ts',
);
const { createCalendarClient, GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_EVENTS_URL } =
  await loadSource('src/infrastructure/google-calendar-client.ts');
const clientId = '123-example.apps.googleusercontent.com';
const identity = { namespace: 'opaque-account-owner', mode: 'personal' };
function notice(id = 'opaque-notice') {
  return analyzeNotice(
    'CalFresh CF377.2\nCounty of Santa Clara\nSubmit your renewal form by October 22, 2026.\nYour interview is scheduled for October 20, 2026 at 10:00 AM.\nYour certification period ends on October 31, 2026.\n[ ] Proof of identity\n[X] Pay stubs for September 2026',
    { id, filename: 'PRIVATE-NAME-case-12345.pdf' },
  );
}
function checked(input) {
  input.deadlines.forEach((item) => (item.confirmed = true));
  input.reviewed = true;
  return input;
}
async function exampleEvent() {
  return createCalendarEvent(getCalendarCandidates([checked(notice())])[0], identity);
}
function mockGoogle({ granted = true, response, popupError, deferred = false } = {}) {
  const state = { config: null, calls: [] };
  const google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          state.config = config;
          return {
            requestAccessToken(options) {
              state.calls.push(options);
              if (!deferred)
                queueMicrotask(() => {
                  if (popupError) config.error_callback({ type: popupError });
                  else
                    config.callback(
                      response || {
                        access_token: 'memory-only-token',
                        expires_in: 3600,
                        scope: GOOGLE_CALENDAR_SCOPE,
                        token_type: 'Bearer',
                      },
                    );
                });
            },
          };
        },
        hasGrantedAllScopes: () => granted,
      },
    },
  };
  return { google, state };
}

test('calendar candidates use checked adapter facts, preserve independent dates, and never include unchecked options', () => {
  const input = notice();
  assert.equal(getCalendarCandidates([input]).length, 0);
  const before = structuredClone(checked(input));
  const candidates = getCalendarCandidates([input]);
  assert.deepEqual(
    candidates.map((item) => [item.kind, item.date]),
    [
      ['interview', '2026-10-20'],
      ['submit', '2026-10-22'],
      ['end', '2026-10-31'],
    ],
  );
  assert.equal(candidates.find((item) => item.kind === 'end').contextOnly, true);
  assert.match(candidates.find((item) => item.kind === 'end').description, /not a filing deadline/);
  assert.ok(!JSON.stringify(candidates).includes('PRIVATE-NAME'));
  assert.ok(!JSON.stringify(candidates).includes('Pay stubs'));
  assert.deepEqual(input, before);
  const unchecked = checked(notice('unselected'));
  unchecked.requests = [
    {
      id: 'unchecked',
      kind: 'form',
      title: 'Complete a form',
      quote: '[ ] Submit the form',
      status: 'todo',
    },
  ];
  assert.deepEqual(
    getCalendarCandidates([unchecked]).map((item) => item.kind),
    ['end'],
  );
  unchecked.deadlines.find((item) => item.kind === 'end').confirmed = false;
  assert.equal(getCalendarCandidates([unchecked]).length, 0);
});

test('invalid, excluded, unknown, unsupported and unresolved competing dates cannot become Calendar reminders', () => {
  const input = checked(notice());
  input.deadlines = [
    { id: 'bad', kind: 'submit', date: '2026-02-30', confirmed: true },
    { id: 'unknown', kind: 'interview', date: null, confirmed: true },
    { id: 'excluded', kind: 'end', date: '2026-10-31', confirmed: true, excluded: true },
    { id: 'not-a-deadline', kind: 'notice', date: '2026-10-09', confirmed: true },
  ];
  assert.equal(getCalendarCandidates([input]).length, 0);
  const conflict = checked(
    analyzeNotice(
      'CalFresh CF377.6\nPlease return the requested items by October 23, 2026.\nPlease return the requested items by October 26, 2026.',
      { id: 'conflict' },
    ),
  );
  assert.equal(getCalendarCandidates([conflict]).length, 0);
  conflict.deadlines[0].excluded = true;
  assert.equal(
    getCalendarCandidates([conflict]).length,
    0,
    'excluding one original date alone is not a recorded clarification',
  );
  conflict.clarification = 'The county clarified that the October 26 date applies.';
  assert.deepEqual(
    getCalendarCandidates([conflict]).map((item) => item.date),
    ['2026-10-26'],
  );
  conflict.supported = false;
  assert.equal(getCalendarCandidates([conflict]).length, 0);
  const endOnly = checked(
    analyzeNotice('CalFresh CF377.2\nYour certification ends on October 31, 2026.', {
      id: 'end-only',
    }),
  );
  assert.ok(
    getCalendarCandidates([endOnly]).every((item) => item.kind === 'end' && item.contextOnly),
    'a period end can never become an invented submission date',
  );
});

test('semantic duplicate facts collapse and deterministic IDs remain private across retries, locales and account namespaces', async () => {
  const input = checked(notice());
  const fact = input.deadlines.find((item) => item.kind === 'submit');
  input.deadlines.push({ ...fact, id: 'same-date-another-source-span' });
  const candidates = getCalendarCandidates([input]);
  assert.equal(candidates.filter((item) => item.kind === 'submit').length, 1);
  const first = await createCalendarEvent(candidates[0], identity);
  const second = await createCalendarEvent(getCalendarCandidates([input], 'es')[0], identity);
  assert.equal(first.id, second.id, 'translation must not create duplicate reminders');
  assert.match(first.id, /^[0-9a-v]{70}$/);
  assert.notEqual(
    first.id,
    (await createCalendarEvent(candidates[0], { ...identity, namespace: 'another-account' })).id,
  );
  const sample = await createCalendarEvent(candidates[0], { ...identity, mode: 'demo' });
  assert.notEqual(first.id, sample.id);
  assert.match(sample.description, /Fictional.*not your benefit deadline/);
  assert.equal(first.visibility, 'private');
  assert.equal(first.transparency, 'transparent');
  const output = JSON.stringify(first);
  for (const privateValue of [
    input.id,
    fact.id,
    identity.namespace,
    input.filename,
    'CalFresh',
    'Santa Clara',
    'Pay stubs',
    '10:00',
  ])
    assert.ok(!output.includes(privateValue));
  assert.equal(nextCalendarDay('2028-02-29'), '2028-03-01');
  assert.equal(nextCalendarDay('2026-12-31'), '2027-01-01');
  assert.throws(() => nextCalendarDay('2026-02-30'));
  await assert.rejects(
    createCalendarEvent(candidates[0], { ...identity, namespace: '' }),
    /identity/,
  );
});

test('Calendar requests use explicit optional scope and do not request a token or write until the caller connects and confirms', async () => {
  const { google, state } = mockGoogle();
  const requests = [];
  const client = createCalendarClient({
    clientId,
    getGoogle: () => google,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json({ htmlLink: 'https://calendar.google.com/calendar/event?eid=example' });
    },
  });
  const event = await exampleEvent();
  assert.equal(state.calls.length, 0);
  await assert.rejects(client.add(event), (error) => error.code === 'token-expired');
  assert.equal(state.calls.length, 0);
  assert.equal(requests.length, 0);
  await client.connect();
  assert.equal(client.connected, true);
  assert.equal(state.config.scope, GOOGLE_CALENDAR_SCOPE);
  assert.equal(state.config.include_granted_scopes, false);
  assert.deepEqual(state.calls, [{ prompt: 'select_account' }]);
  const result = await client.add({
    ...event,
    attendees: [{ email: 'must-not-send@example.test' }],
    sourceText: 'PRIVATE DATA',
    visibility: 'public',
  });
  assert.equal(result.status, 'added');
  assert.match(result.url, /^https:\/\/calendar.google.com/);
  assert.equal(requests[0].url, GOOGLE_CALENDAR_EVENTS_URL);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'omit');
  const sent = JSON.parse(requests[0].options.body);
  assert.equal(sent.visibility, 'private');
  assert.equal(sent.attendees, undefined);
  assert.equal(sent.sourceText, undefined);
  assert.equal(requests.filter((item) => item.options.method === 'GET').length, 0);
  client.disconnect();
  assert.equal(client.connected, false);
});

test('granular denial, OAuth denial and popup cancellation produce actionable errors without making API requests', async () => {
  for (const [options, expected] of [
    [{ granted: false }, 'scope-denied'],
    [
      { response: { access_token: 'partial', expires_in: 3600, scope: 'openid email' } },
      'scope-denied',
    ],
    [{ response: { error: 'access_denied' } }, 'access_denied'],
    [{ popupError: 'popup_closed' }, 'popup_closed'],
    [{ popupError: 'popup_failed_to_open' }, 'popup_failed_to_open'],
  ]) {
    const { google } = mockGoogle(options);
    let requests = 0;
    const client = createCalendarClient({
      clientId,
      getGoogle: () => google,
      fetch: async () => {
        requests++;
        return Response.json({});
      },
    });
    await assert.rejects(client.connect(), (error) => error.code === expected);
    assert.equal(client.connected, false);
    assert.equal(requests, 0);
  }
  await assert.rejects(
    createCalendarClient({ clientId: '', getGoogle: () => undefined }).connect(),
    (error) => error.code === 'configuration',
  );
  await assert.rejects(
    createCalendarClient({ clientId, getGoogle: () => undefined }).connect(),
    (error) => error.code === 'library-unavailable',
  );
});

test('expiry never triggers silent reauthorization, and disconnect invalidates a pending authorization callback', async () => {
  const { google, state } = mockGoogle();
  let clock = 100_000;
  let requests = 0;
  const client = createCalendarClient({
    clientId,
    getGoogle: () => google,
    now: () => clock,
    fetch: async () => {
      requests++;
      return Response.json({});
    },
  });
  await client.connect();
  clock += 3_580_000;
  assert.equal(client.connected, false);
  await assert.rejects(client.add(await exampleEvent()), (error) => error.code === 'token-expired');
  assert.equal(state.calls.length, 1);
  assert.equal(requests, 0);
  await client.connect();
  assert.equal(state.calls.length, 2, 'only an explicit new Connect call reauthorizes');
  const deferred = mockGoogle({ deferred: true });
  const pending = createCalendarClient({ clientId, getGoogle: () => deferred.google });
  const authorization = pending.connect();
  pending.clear();
  await assert.rejects(authorization, (error) => error.code === 'disconnected');
  deferred.state.config.callback({
    access_token: 'late-token',
    expires_in: 3600,
    scope: GOOGLE_CALENDAR_SCOPE,
  });
  assert.equal(pending.connected, false);
});

test('duplicate inserts never read or overwrite existing events, and repeat batches deduplicate IDs', async () => {
  const { google } = mockGoogle();
  const methods = [];
  const client = createCalendarClient({
    clientId,
    getGoogle: () => google,
    fetch: async (url, options) => {
      methods.push(options.method);
      return Response.json({ error: { errors: [{ reason: 'duplicate' }] } }, { status: 409 });
    },
  });
  await client.connect();
  const event = await exampleEvent();
  assert.deepEqual(await client.addEvents([event, event]), [
    { id: event.id, status: 'already-added' },
  ]);
  assert.deepEqual(methods, ['POST']);
  assert.equal(client.connected, true);
});

test('API disabled, permission errors, server faults and expired grants remain distinguishable', async () => {
  for (const [status, body, expected] of [
    [403, { error: { errors: [{ reason: 'accessNotConfigured' }] } }, 'api-disabled'],
    [403, { error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, 'api-disabled'],
    [403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }, 'access-denied'],
    [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'temporarily-unavailable'],
    [503, {}, 'temporarily-unavailable'],
    [401, {}, 'token-expired'],
  ]) {
    const { google } = mockGoogle();
    const client = createCalendarClient({
      clientId,
      getGoogle: () => google,
      fetch: async () => Response.json(body, { status }),
    });
    await client.connect();
    await assert.rejects(client.add(await exampleEvent()), (error) => error.code === expected);
    if (status === 401) assert.equal(client.connected, false);
  }
});

test('preparing GIS reuses a pending sign-in script and never prompts for Calendar permission', async () => {
  const originalDocument = globalThis.document;
  const { google, state } = mockGoogle();
  let available = false;
  const scripts = [];
  let appended = 0;
  class Script extends EventTarget {
    src = '';
    remove() {
      const index = scripts.indexOf(this);
      if (index >= 0) scripts.splice(index, 1);
    }
  }
  globalThis.document = {
    scripts,
    createElement: () => new Script(),
    head: {
      append(script) {
        appended++;
        scripts.push(script);
      },
    },
  };
  try {
    const client = createCalendarClient({
      clientId,
      getGoogle: () => (available ? google : undefined),
    });
    const first = client.prepare();
    assert.equal(client.prepare(), first, 'one pending load is shared');
    assert.equal(appended, 1);
    assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client');
    available = true;
    scripts[0].dispatchEvent(new Event('load'));
    await first;
    assert.equal(state.calls.length, 0);
    await client.prepare();
    assert.equal(appended, 1);

    available = false;
    let accountLoads = 0;
    scripts[0].addEventListener('load', () => accountLoads++);
    const other = createCalendarClient({
      clientId,
      getGoogle: () => (available ? google : undefined),
    });
    const reused = other.prepare();
    assert.equal(appended, 1, 'an existing account sign-in loader is reused');
    available = true;
    scripts[0].dispatchEvent(new Event('load'));
    await reused;
    assert.equal(accountLoads, 1, 'existing load listeners remain intact');
    assert.equal(state.calls.length, 0);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
