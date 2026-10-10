import test from 'node:test';
import assert from 'node:assert/strict';

// Run against the exact deployment artifact in an isolated profile. Test records
// are fictional and never leave the device or authenticate with a real account.
const enabled = Boolean(process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE);

async function openApp() {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() === 404) missing.push(response.url());
  });
  await page.addInitScript(() => localStorage.setItem('anchor-guide-v1', 'dismissed'));
  await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
  await page.locator('.shell').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app')?.inert);
  return { browser, context, page, errors, missing };
}

async function stored(page) {
  return page.evaluate(async () => {
    const storage = await import(new URL('platform.js', location.href).href);
    return storage.loadState('guest');
  });
}

test('Pages browser: continuity time choices preserve notice facts and fit mobile in both languages', { skip: !enabled, timeout: 60_000 }, async () => {
  const { browser, page, errors, missing } = await openApp();
  try {
    await page.locator('.sidebar [data-page="continuity"]').click();
    await page.locator('.continuity-lane').first().waitFor();
    assert.equal(await page.locator('.continuity-lane').count(), 2);
    const before = await stored(page);
    for (const minutes of [15, 60, 30]) {
      await page.locator(`[data-action="continuity-capacity"][data-minutes="${minutes}"]`).click();
      assert.equal(await page.locator(`[data-minutes="${minutes}"]`).getAttribute('aria-pressed'), 'true');
    }
    assert.deepEqual(await stored(page), before, 'focus choices must not save or alter notice facts');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#language').selectOption('es');
    await page.locator('html[lang="es"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.match(await page.locator('.continuity-intro').innerText(), /CONTINUIDAD|SEGUIMIENTO/i);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, [], 'the repository prefix must resolve every requested asset');
  } finally { await browser.close(); }
});

test('Pages browser: explicit evidence reuse and agency response survive refresh without completing another letter', { skip: !enabled, timeout: 60_000 }, async () => {
  const { browser, page, errors, missing } = await openApp();
  try {
    // Seed two actual notice-engine models, not hand-written presentation data.
    await page.evaluate(async () => {
      const engine = await import(new URL('engine.js', location.href).href);
      const storage = await import(new URL('platform.js', location.href).href);
      const text = 'CalFresh CF377.6\nCounty of Santa Clara\nNotice Date: October 9, 2026\nPlease return the requested items by October 24, 2026.\n[X] Pay stubs for September 2026';
      const source = engine.analyzeNotice(text, { id: 'browser-source', filename: 'fictional-first-letter.txt', isDemo: false });
      const target = engine.analyzeNotice(text, { id: 'browser-target', filename: 'fictional-second-letter.txt', isDemo: false });
      source.title = 'Fictional first letter';
      target.title = 'Fictional second letter';
      for (const notice of [source, target]) {
        notice.reviewed = true;
        notice.deadlines.forEach(date => { date.confirmed = true; });
      }
      source.requests.forEach(request => { request.status = 'done'; });
      const attachmentId = await storage.saveAttachment(new File(['Fictional receipt only'], 'fictional-receipt.txt', { type: 'text/plain' }));
      await storage.saveState({
        version: 1, mode: 'personal', lang: 'en', county: 'santa-clara',
        demo: { notices: [], events: [] },
        personal: { notices: [source, target], events: [{
          id: 'browser-submission', noticeId: source.id, kind: 'submitted',
          title: 'Fictional submission recorded by you', date: '2026-10-09T12:00:00',
          detail: 'Fictional upload; nothing was sent to an agency.', attachmentId,
        }] },
      }, 'guest');
    });
    await page.reload();
    await page.locator('.shell').waitFor();
    await page.waitForFunction(() => !document.querySelector('#app')?.inert);
    await page.locator('.sidebar [data-page="continuity"]').click();
    await page.locator('[data-action="continuity-reuse"]').first().click();
    await page.locator('#reuse-form input[type="checkbox"]').check();
    await page.locator('#reuse-detail').fill('Fictional test: compared the person, September period, and both original instructions.');
    await page.locator('#reuse-form button[type="submit"]').click();
    await page.locator('.continuity-match .tag').waitFor();
    let state = await stored(page);
    const link = state.personal.events.find(event => event.kind === 'evidence-reused');
    assert.equal(link.sourceNoticeId, 'browser-source');
    assert.equal(link.noticeId, 'browser-target');
    assert.ok(state.personal.notices[1].requests.every(request => request.status !== 'done'));

    await page.locator('.continuity-details summary').first().click();
    await page.locator('[data-action="continuity-acknowledge"]').first().click();
    await page.locator('#agency-date').fill('2026-10-10');
    await page.locator('#agency-detail').fill('Fictional response: worker said the upload arrived; review is pending.');
    await page.locator('#acknowledgment-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#modal')?.open);
    await page.reload();
    await page.locator('.continuity-lane').first().waitFor();
    state = await stored(page);
    const response = state.personal.events.find(event => event.kind === 'acknowledged');
    assert.equal(response.submissionEventId, 'browser-submission');
    assert.match(response.detail, /review is pending/);
    assert.ok(state.personal.notices[1].requests.every(request => request.status !== 'done'));
    assert.equal(state.personal.events.filter(event => event.kind === 'submitted').length, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
  } finally { await browser.close(); }
});
