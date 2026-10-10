import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

test('standalone Worker routes private APIs without falling through to static assets', async () => {
  let assetsCalled = false;
  const response = await worker.fetch(new Request('https://anchor.test/api/account'), {
    ASSETS: {fetch() { assetsCalled = true; throw new Error('API reached assets'); }},
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configured, false);
  assert.equal(assetsCalled, false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('standalone Worker serves assets with popup-safe security headers and fresh shell', async () => {
  for (const path of ['/', '/sw.js', '/app.js']) {
    const response = await worker.fetch(new Request(`https://anchor.test${path}`), {
      ASSETS: {fetch: async () => new Response('asset', {headers:{'Cache-Control':'public, max-age=60'}})},
    });
    assert.equal(await response.text(), 'asset');
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Cache-Control'), path === '/app.js' ? 'public, max-age=60' : 'no-cache');
  }
});
