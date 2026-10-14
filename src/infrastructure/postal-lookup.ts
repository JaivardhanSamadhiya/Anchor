/**
 * ZIP-only public place lookup. Only the ZIP supplied for this lookup is sent;
 * no question text, form draft, street address, account, or document is sent.
 * Zippopotam.us supplies GeoNames data; this is not USPS address verification.
 * https://docs.zippopotam.us/docs/getting-started/
 */
export const POSTAL_LOOKUP_ORIGIN = 'https://api.zippopotam.us';
export const POSTAL_LOOKUP_TIMEOUT_MS = 8_000;
export const POSTAL_LOOKUP_MAX_BYTES = 32_768;

export interface PostalPlace {
  city: string;
  state: string;
  stateCode: string;
}
export interface PostalLookupResult {
  zip: string;
  places: PostalPlace[];
  sourceUrl: string;
}
export type PostalLookupErrorCode = 'invalid' | 'not-found' | 'unavailable' | 'aborted';

/** Stable codes allow the interface to translate safe messages locally. */
export class PostalLookupError extends Error {
  public readonly code: PostalLookupErrorCode;

  constructor(code: PostalLookupErrorCode) {
    super(
      {
        invalid: 'Enter a five-digit US ZIP code.',
        'not-found': 'No postal places were returned for that ZIP code.',
        unavailable: 'The postal-place lookup is unavailable. Try the USPS lookup.',
        aborted: 'The postal-place lookup was cancelled.',
      }[code],
    );
    this.name = 'PostalLookupError';
    this.code = code;
  }
}

// Validate the pairing, not just a two-letter value supplied by a remote API.
const US_STATES: Readonly<Record<string, string>> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  AS: 'American Samoa',
  FM: 'Federated States of Micronesia',
  GU: 'Guam',
  MH: 'Marshall Islands',
  MP: 'Northern Mariana Islands',
  PW: 'Palau',
  PR: 'Puerto Rico',
  VI: 'Virgin Islands',
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function placeName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100 || value !== value.trim()) return null;
  // Names may contain Unicode letters and ordinary name punctuation. Markup,
  // controls, URLs, and bidirectional formatting characters are not place names.
  return /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .’'()-]*$/u.test(value) ? value : null;
}

function validateResult(raw: unknown, zip: string, sourceUrl: string): PostalLookupResult {
  if (
    !record(raw) ||
    raw['post code'] !== zip ||
    raw['country abbreviation'] !== 'US' ||
    raw.country !== 'United States' ||
    !Array.isArray(raw.places) ||
    raw.places.length < 1 ||
    raw.places.length > 20
  )
    throw new PostalLookupError('unavailable');

  const places: PostalPlace[] = [];
  const seen = new Set<string>();
  for (const item of raw.places) {
    if (!record(item)) throw new PostalLookupError('unavailable');
    const city = placeName(item['place name']);
    const stateCode = item['state abbreviation'];
    const state = placeName(item.state);
    if (
      !city ||
      !state ||
      typeof stateCode !== 'string' ||
      !Object.hasOwn(US_STATES, stateCode) ||
      state.toLocaleLowerCase('en-US') !== US_STATES[stateCode].toLocaleLowerCase('en-US')
    )
      throw new PostalLookupError('unavailable');
    const key = `${stateCode}:${city.toLocaleLowerCase('en-US')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ city, state: US_STATES[stateCode], stateCode });
  }
  // All alternatives remain visible; the client never guesses which one is a
  // specific street's preferred mailing city or returns unused coordinates.
  return { zip, places, sourceUrl };
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (
    (length !== null && (!/^\d+$/.test(length) || Number(length) > POSTAL_LOOKUP_MAX_BYTES)) ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') ||
    !response.body
  )
    throw new PostalLookupError('unavailable');

  const reader = response.body.getReader();
  const stopReading = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', stopReading, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new PostalLookupError('unavailable');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > POSTAL_LOOKUP_MAX_BYTES) throw new PostalLookupError('unavailable');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    signal.removeEventListener('abort', stopReading);
    // Stop reading oversized or invalid responses; never retain response data.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Sends only a validated five-digit ZIP, with no credentials or referrer.
 * A separate signal combines caller cancellation and a bounded timeout. A
 * race also stops a fetch implementation or response stream that ignores it.
 */
export async function lookupPostalPlaces(
  zip: string,
  signal?: AbortSignal,
  fetchOverride: typeof globalThis.fetch = globalThis.fetch,
): Promise<PostalLookupResult> {
  if (typeof zip !== 'string' || !/^\d{5}$/.test(zip)) throw new PostalLookupError('invalid');
  if (signal?.aborted) throw new PostalLookupError('aborted');
  const sourceUrl = `${POSTAL_LOOKUP_ORIGIN}/us/${zip}`;
  const controller = new AbortController();
  let rejectStopped: (error: PostalLookupError) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStopped = reject;
  });
  const cancel = () => {
    controller.abort();
    rejectStopped(new PostalLookupError('aborted'));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    controller.abort();
    rejectStopped(new PostalLookupError('unavailable'));
  }, POSTAL_LOOKUP_TIMEOUT_MS);

  try {
    const operation = async () => {
      const response = await fetchOverride(sourceUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (response.url && response.url !== sourceUrl) throw new PostalLookupError('unavailable');
      if (response.status === 404) throw new PostalLookupError('not-found');
      if (!response.ok || response.status !== 200) throw new PostalLookupError('unavailable');
      return validateResult(await boundedJson(response, controller.signal), zip, sourceUrl);
    };
    return await Promise.race([operation(), stopped]);
  } catch (error) {
    if (signal?.aborted) throw new PostalLookupError('aborted');
    if (error instanceof PostalLookupError) throw error;
    // Remote error strings and response bodies are never displayed or logged.
    throw new PostalLookupError('unavailable');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
