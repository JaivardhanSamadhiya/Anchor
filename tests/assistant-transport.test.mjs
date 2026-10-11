import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseTransport } from '../src/infrastructure/supabase-transport.ts';
import { sourceGuidance } from '../src/domain/program-assistant.ts';

const A = 'e54b4d7e-a66a-4c04-ad72-10b23c8d4cc0';
const B = '37d11f44-57df-4a6d-bde5-df977714bcb3';
const CLIENT_ID = 'fictional-client.apps.googleusercontent.com';
const topic = () => ({
  program: 'calfresh',
  questionId: 'documents',
  focus: 'proof-alternatives',
  language: 'en',
  adultConfirmed: true,
});
const user = (id = A) => ({
  id,
  email: 'private-profile@example.invalid',
  user_metadata: { full_name: 'Private Test Profile', privateNotice: 'Never send this to Gemini.' },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};

function fixture({ resident = user(), initialSession = true, clientId = CLIENT_ID } = {}) {
  let current = resident,
    verificationError = null,
    verificationHook = null;
  let invokeHook = null;
  const listeners = new Set(),
    calls = [],
    invocation = deferred();
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      async getUser() {
        calls.push({ kind: 'verify' });
        const snapshot = current;
        if (verificationHook) await verificationHook();
        return { data: { user: snapshot }, error: verificationError };
      },
    },
    functions: {
      async invoke(name, options) {
        calls.push({ kind: 'invoke', name, options: structuredClone(options) });
        invocation.resolve();
        return invokeHook
          ? invokeHook(options.body)
          : { data: sourceGuidance(options.body), error: null };
      },
    },
  };
  const transport = createSupabaseTransport({ client, googleClientId: clientId });
  const change = (event, nextUser) => {
    current = nextUser;
    for (const callback of listeners) callback(event, nextUser ? { user: nextUser } : null);
  };
  if (initialSession) change('INITIAL_SESSION', resident);
  return {
    transport,
    calls,
    invocation: invocation.promise,
    change,
    setVerificationError: (value) => {
      verificationError = value;
    },
    setVerificationHook: (value) => {
      verificationHook = value;
    },
    setInvokeHook: (value) => {
      invokeHook = value;
    },
  };
}

test('assistant requires configured sign-in and remotely verified identity before invoking the function', async (t) => {
  for (const settings of [{ resident: null }, { clientId: '' }]) {
    const f = fixture(settings);
    t.after(() => f.transport.destroy());
    await assert.rejects(f.transport.askProgram(topic()), /Sign in|not configured/i);
    assert.equal(f.calls.filter((call) => call.kind === 'invoke').length, 0);
  }
  const f = fixture();
  t.after(() => f.transport.destroy());
  f.setVerificationError({ status: 401, message: 'private token or provider details' });
  await assert.rejects(
    f.transport.askProgram(topic()),
    (error) => error.status === 401 && !error.message.includes('private'),
  );
  assert.deepEqual(
    f.calls.map((call) => call.kind),
    ['verify'],
  );
});

test('malformed topics, arbitrary text, personal fields, and missing adult confirmation never invoke the SDK', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  for (const value of [
    'How do I renew SNAP?',
    null,
    { ...topic(), question: 'My notice contains private information.' },
    { ...topic(), sourceText: 'Original notice text' },
    { ...topic(), attachment: new Uint8Array([1, 2, 3]) },
    { ...topic(), userId: A },
    { ...topic(), adultConfirmed: false },
    { ...topic(), focus: 'personal-eligibility-calculation' },
    { ...topic(), destination: 'calendar' },
  ])
    await assert.rejects(f.transport.askProgram(value), /public program topic/);
  assert.equal(
    f.calls.length,
    0,
    'Payload validation happens even before the remote identity check',
  );
});

test('successful assistant invocation sends only canonical public enums and never profile or notice information', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  const response = await f.transport.askProgram(topic());
  assert.equal(response.mode, 'source-guidance');
  assert.deepEqual(
    f.calls.map((call) => call.kind),
    ['verify', 'invoke'],
  );
  const invoke = f.calls[1];
  assert.equal(invoke.name, 'anchor-assistant');
  assert.deepEqual(invoke.options, { body: topic() });
  const serialized = JSON.stringify(invoke.options);
  for (const privateValue of [A, 'private-profile', 'Private Test Profile', 'Never send this'])
    assert.ok(!serialized.includes(privateValue));
  assert.ok(
    response.citations.every(
      (citation) => citation.url.startsWith('https://') && citation.url.includes('.gov/'),
    ),
  );
});

test('a valid first verification works even when the initial auth event has not arrived yet', async (t) => {
  const f = fixture({ initialSession: false });
  t.after(() => f.transport.destroy());
  const response = await f.transport.askProgram(topic());
  assert.equal(response.mode, 'source-guidance');
  assert.equal(f.calls.filter((call) => call.kind === 'invoke').length, 1);
});

test('forged sources, URLs, navigation, and response metadata are rejected at the transport boundary', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  const valid = sourceGuidance(topic());
  for (const forged of [
    { ...valid, citations: [{ ...valid.citations[0], url: 'https://attacker.invalid/steal' }] },
    { ...valid, citations: [{ ...valid.citations[0], id: 'invented', title: 'Fake authority' }] },
    { ...valid, navigation: { page: 'delete-account', label: 'Delete your account' } },
    { ...valid, mode: 'unverified-ai' },
    { ...valid, sourceVersion: 'stale-or-altered' },
    { ...valid, answer: '<script>readPrivateWorkspace()</script>' },
  ]) {
    f.setInvokeHook(async () => ({ data: forged, error: null }));
    await assert.rejects(f.transport.askProgram(topic()), /could not be verified/);
  }
});

test('account changes during remote identity verification prevent any assistant invocation', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  const wait = deferred();
  f.setVerificationHook(() => wait.promise);
  const pending = f.transport.askProgram(topic());
  f.change('SIGNED_IN', user(B));
  wait.resolve();
  await assert.rejects(pending, /account changed/i);
  assert.equal(f.calls.filter((call) => call.kind === 'invoke').length, 0);
});

test('account switching, signing out, and switching away then back discard delayed assistant results', async (t) => {
  for (const transition of ['switch', 'signout', 'away-and-back']) {
    const f = fixture();
    t.after(() => f.transport.destroy());
    const wait = deferred();
    f.setInvokeHook(() => wait.promise);
    const pending = f.transport.askProgram(topic());
    await f.invocation;
    f.change(
      transition === 'signout' ? 'SIGNED_OUT' : 'SIGNED_IN',
      transition === 'signout' ? null : user(B),
    );
    if (transition === 'away-and-back') f.change('SIGNED_IN', user(A));
    wait.resolve({ data: sourceGuidance(topic()), error: null });
    await assert.rejects(pending, /account changed.*discarded/i);
  }
});

test('a token refresh for the same verified account does not discard a valid assistant result', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  const wait = deferred();
  f.setInvokeHook(() => wait.promise);
  const pending = f.transport.askProgram(topic());
  await f.invocation;
  f.change('TOKEN_REFRESHED', user(A));
  wait.resolve({ data: sourceGuidance(topic()), error: null });
  assert.equal((await pending).mode, 'source-guidance');
});

test('canceling a pending SDK call discards late success and safely handles late failure', async (t) => {
  for (const outcome of ['success', 'failure']) {
    const f = fixture();
    t.after(() => f.transport.destroy());
    const wait = deferred(),
      controller = new AbortController();
    f.setInvokeHook(() => wait.promise);
    const pending = f.transport.askProgram(topic(), controller.signal);
    await f.invocation;
    controller.abort();
    await assert.rejects(pending, (error) => error.name === 'AbortError');
    if (outcome === 'success') wait.resolve({ data: sourceGuidance(topic()), error: null });
    else wait.reject(new Error('private late provider failure'));
    await new Promise((resolve) => setImmediate(resolve));
  }
  const f = fixture();
  t.after(() => f.transport.destroy());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.transport.askProgram(topic(), controller.signal),
    (error) => error.name === 'AbortError',
  );
  assert.equal(f.calls.length, 0);
});

test('service errors provide actionable safe guidance without provider bodies or credentials', async (t) => {
  const f = fixture();
  t.after(() => f.transport.destroy());
  for (const [status, expected] of [
    [404, /not been deployed/],
    [429, /limit/],
    [401, /sign in/],
    [500, /unavailable/],
  ]) {
    f.setInvokeHook(async () => ({
      data: null,
      error: { message: 'secret-provider-body', context: { status } },
    }));
    await assert.rejects(
      f.transport.askProgram(topic()),
      (error) => expected.test(error.message) && !error.message.includes('secret-provider-body'),
    );
  }
});
