import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupPostalPlaces,
  PostalLookupError,
  POSTAL_LOOKUP_MAX_BYTES,
  POSTAL_LOOKUP_TIMEOUT_MS,
} from '../src/infrastructure/postal-lookup.ts';

const postal = (overrides = {}) => ({
  'post code': '95124',
  country: 'United States',
  'country abbreviation': 'US',
  places: [
    {
      'place name': 'San Jose',
      state: 'California',
      'state abbreviation': 'CA',
      latitude: 'private-unneeded-coordinate',
      longitude: 'private-unneeded-coordinate',
    },
  ],
  ...overrides,
});
const response = (value, options = {}) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...options,
  });
const hasCode = (code) => (error) => error instanceof PostalLookupError && error.code === code;

test('ZIP lookup sends exactly the validated ZIP to a fixed origin without credentials or referrer', async () => {
  const calls = [];
  const result = await lookupPostalPlaces('95124', undefined, async (url, options) => {
    calls.push({ url, options });
    return response(postal());
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.zippopotam.us/us/95124');
  assert.deepEqual(
    { ...calls[0].options, signal: undefined },
    {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal: undefined,
      headers: { Accept: 'application/json' },
    },
  );
  assert.deepEqual(result, {
    zip: '95124',
    sourceUrl: 'https://api.zippopotam.us/us/95124',
    places: [{ city: 'San Jose', state: 'California', stateCode: 'CA' }],
  });
  assert.equal(JSON.stringify(result).includes('coordinate'), false);
});

test('invalid ZIP input cannot initiate a network request', async () => {
  let calls = 0;
  for (const zip of [
    null,
    95124,
    '',
    '9512',
    '951240',
    '95124-1234',
    ' 95124',
    '95124 ',
    '９５１２４',
    '95124?address=private',
  ]) {
    await assert.rejects(
      lookupPostalPlaces(zip, undefined, async () => {
        calls++;
        return response(postal());
      }),
      hasCode('invalid'),
    );
  }
  assert.equal(calls, 0);
});

test('all distinct alternatives are preserved and same-city duplicates are removed within a state', async () => {
  const raw = postal({
    places: [
      { 'place name': 'Example City', state: 'California', 'state abbreviation': 'CA' },
      { 'place name': 'example city', state: 'California', 'state abbreviation': 'CA' },
      { 'place name': 'Example Township', state: 'California', 'state abbreviation': 'CA' },
      { 'place name': 'Example City', state: 'Nevada', 'state abbreviation': 'NV' },
    ],
  });
  const result = await lookupPostalPlaces('95124', undefined, async () => response(raw));
  assert.deepEqual(result.places, [
    { city: 'Example City', state: 'California', stateCode: 'CA' },
    { city: 'Example Township', state: 'California', stateCode: 'CA' },
    { city: 'Example City', state: 'Nevada', stateCode: 'NV' },
  ]);
});

test('404 is a bounded not-found result; remote failures and error bodies remain undisclosed', async () => {
  await assert.rejects(
    lookupPostalPlaces('95124', undefined, async () =>
      response({ private: 'untrusted response' }, { status: 404 }),
    ),
    hasCode('not-found'),
  );
  for (const status of [401, 429, 500]) {
    await assert.rejects(
      lookupPostalPlaces('95124', undefined, async () =>
        response({ private: 'secret' }, { status }),
      ),
      (error) => hasCode('unavailable')(error) && !error.message.includes('secret'),
    );
  }
  await assert.rejects(
    lookupPostalPlaces('95124', undefined, async () => {
      throw new Error('private token');
    }),
    (error) => hasCode('unavailable')(error) && !error.message.includes('private token'),
  );
});

test('response country, ZIP, state pairing, number of places, and names must validate before use', async () => {
  const badPlaces = [
    [],
    Array.from({ length: 21 }, () => postal().places[0]),
    [null],
    [{ ...postal().places[0], 'state abbreviation': 'ZZ' }],
    [{ ...postal().places[0], 'state abbreviation': '__proto__' }],
    [{ ...postal().places[0], state: 'Nevada' }],
    [{ ...postal().places[0], 'place name': '<img src=x onerror=alert(1)>' }],
    [{ ...postal().places[0], 'place name': 'City\nSecret' }],
    [{ ...postal().places[0], 'place name': 'City\u202Ehidden' }],
    [{ ...postal().places[0], 'place name': 'x'.repeat(101) }],
    [{ ...postal().places[0], 'place name': 'City ' }],
  ];
  const cases = [
    null,
    [],
    postal({ 'post code': '00000' }),
    postal({ 'post code': 95124 }),
    postal({ 'country abbreviation': 'CA' }),
    postal({ country: 'Canada' }),
    ...badPlaces.map((places) => postal({ places })),
  ];
  for (const raw of cases) {
    await assert.rejects(
      lookupPostalPlaces('95124', undefined, async () => response(raw)),
      hasCode('unavailable'),
    );
  }
});

test('state validation accepts district and territory names and preserves Unicode place names', async () => {
  const result = await lookupPostalPlaces('95124', undefined, async () =>
    response(
      postal({
        places: [
          { 'place name': 'Washington', state: 'District of Columbia', 'state abbreviation': 'DC' },
          { 'place name': 'San Germán', state: 'Puerto Rico', 'state abbreviation': 'PR' },
          { 'place name': 'Hagåtña', state: 'Guam', 'state abbreviation': 'GU' },
        ],
      }),
    ),
  );
  assert.deepEqual(
    result.places.map((place) => place.stateCode),
    ['DC', 'PR', 'GU'],
  );
  assert.equal(result.places[1].city, 'San Germán');
});

test('a redirected response is rejected even when a fetch override ignores redirect:error', async () => {
  const redirected = response(postal());
  Object.defineProperty(redirected, 'url', { value: 'https://untrusted.example/us/95124' });
  await assert.rejects(
    lookupPostalPlaces('95124', undefined, async () => redirected),
    hasCode('unavailable'),
  );
});

test('JSON MIME type, UTF-8, syntax, declared size, and streamed byte size are all bounded', async () => {
  const cases = [
    new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    new Response(new Uint8Array([0xff, 0xfe]), { headers: { 'Content-Type': 'application/json' } }),
    response(postal(), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(POSTAL_LOOKUP_MAX_BYTES + 1),
      },
    }),
    response(postal(), {
      headers: { 'Content-Type': 'application/json', 'Content-Length': 'invalid' },
    }),
    response(postal({ excess: 'x'.repeat(POSTAL_LOOKUP_MAX_BYTES) })),
  ];
  for (const value of cases) {
    await assert.rejects(
      lookupPostalPlaces('95124', undefined, async () => value),
      hasCode('unavailable'),
    );
  }
});

test('oversized streaming JSON is cancelled rather than downloaded indefinitely', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(POSTAL_LOOKUP_MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    lookupPostalPlaces(
      '95124',
      undefined,
      async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    ),
    hasCode('unavailable'),
  );
  assert.equal(cancelled, true);
});

test('caller abort prevents a fetch and cancels an in-flight fetch that ignores its signal', async () => {
  const already = new AbortController();
  already.abort();
  let calls = 0;
  await assert.rejects(
    lookupPostalPlaces('95124', already.signal, async () => {
      calls++;
      return response(postal());
    }),
    hasCode('aborted'),
  );
  assert.equal(calls, 0);

  const controller = new AbortController();
  let fetchSignal;
  const pending = lookupPostalPlaces('95124', controller.signal, async (_url, options) => {
    fetchSignal = options.signal;
    return await new Promise(() => {});
  });
  controller.abort();
  await assert.rejects(pending, hasCode('aborted'));
  assert.equal(fetchSignal.aborted, true);
});

test('caller abort also stops a stalled response body', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const pending = lookupPostalPlaces(
    '95124',
    controller.signal,
    async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
  );
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, hasCode('aborted'));
  assert.equal(cancelled, true);
});

test('eight-second timeout aborts a fetch that ignores its signal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fetchSignal;
  const pending = lookupPostalPlaces('95124', undefined, async (_url, options) => {
    fetchSignal = options.signal;
    return await new Promise(() => {});
  });
  const rejection = assert.rejects(pending, hasCode('unavailable'));
  t.mock.timers.tick(POSTAL_LOOKUP_TIMEOUT_MS);
  await rejection;
  assert.equal(fetchSignal.aborted, true);
});

test('the same timeout bounds response-body streaming and cancels a stalled reader', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const pending = lookupPostalPlaces(
    '95124',
    undefined,
    async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
  );
  const rejection = assert.rejects(pending, hasCode('unavailable'));
  await Promise.resolve();
  t.mock.timers.tick(POSTAL_LOOKUP_TIMEOUT_MS);
  await rejection;
  assert.equal(cancelled, true);
});
