import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { analyzeNotice } from '../web/engine.js';
import { DEMO_NOTICES } from '../web/data.js';

// Optional actual-app acceptance checks, always in new browser contexts. The
// authenticated case exercises UI/API wiring through a fictional session fixture;
// it does not exercise or claim a real Google sign-in or a real cloud deployment.
const enabled = Boolean(process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE);
const baseURL = process.env.ANCHOR_BROWSER_TEST_URL;
const ACCOUNT_ID = 'fictional-browser-qa-resident';
const CSRF = 'fictional-browser-qa-csrf';
const user = { id: ACCOUNT_ID, name: 'Fictional QA Resident', email: 'resident@example.test' };

async function openBrowser() {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  return chromium.launch({ headless: true, ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}) });
}

async function newPage(browser, { skipGuide = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (skipGuide) await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'));
  return { context, page, errors };
}

async function loadApp(page) {
  await page.goto(baseURL);
  await page.locator('.shell').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app')?.inert);
}

async function storedState(page, scope = 'guest') {
  return page.evaluate(async owner => {
    const storage = await import(new URL('platform.js', location.href).href);
    return storage.loadState(owner);
  }, scope);
}

async function nav(page, destination) {
  await page.locator(`.sidebar [data-action="nav"][data-page="${destination}"]`).click();
}

async function eventually(predicate, message) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await delay(50);
  }
}

function apiFixture() {
  const source = DEMO_NOTICES.find(notice => notice.id === 'renewal');
  const restored = {
    ...analyzeNotice(source.text, { id: 'fictional-account-notice', filename: 'fictional-restored-original.txt', isDemo: false, now: '2026-10-09T19:00:00Z' }),
    title: 'Fictional restored account notice', reviewed: false, originalAttachmentId: 'fictional-restored-file',
  };
  const record = {
    state: { version: 1, lang: 'en', county: 'santa-clara', personal: { notices: [restored], events: [] } },
    revision: 7,
  };
  const files = new Map([['fictional-restored-file', { id: 'fictional-restored-file', name: restored.filename, type: 'text/plain', size: Buffer.byteLength(source.text), bytes: Buffer.from(source.text) }]]);
  const calls = [], violations = [];

  async function attach(context) {
    // Session state belongs to this isolated context; records and file bytes are
    // shared to model a second device reading the same fictional account.
    const session = { authenticated: true };
    // Replace only the transport module in this isolated fictional-account test.
    // Real SQL policies and SDK transport are verified in their own test suites.
    await context.route('**/supabase-transport.js', route => route.fulfill({contentType:'text/javascript',body:'export function createConfiguredSupabaseTransport(){return {fetch:globalThis.fetch.bind(globalThis),onAuthChange:()=>()=>{},destroy:()=>{}}}'}));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const headers = await request.allHeaders();
      calls.push({ path, method, headers });
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/account' && method === 'GET') return json({ configured: true, authenticated: session.authenticated, user: session.authenticated ? user : null, csrfToken: session.authenticated ? CSRF : null, googleClientId: 'fictional-qa.apps.googleusercontent.com' });
      if (!session.authenticated) return json({ error: 'Unauthorized' }, 401);
      if (headers['x-anchor-account'] !== ACCOUNT_ID) {
        violations.push(`${method} ${path}: missing or wrong account scope`);
        return json({ error: 'Account changed' }, 401);
      }
      if (!['GET', 'HEAD'].includes(method) && headers['x-anchor-csrf'] !== CSRF) {
        violations.push(`${method} ${path}: missing or wrong CSRF token`);
        return json({ error: 'CSRF required' }, 403);
      }
      if (path === '/api/workspace' && method === 'GET') return json(record);
      if (path === '/api/workspace' && method === 'PUT') {
        const payload = request.postDataJSON();
        if (payload.expectedRevision !== record.revision) return json({ error: 'Revision conflict' }, 409);
        assert.equal(payload.state.demo, undefined, 'sample notices must never be sent to the account API');
        assert.equal(payload.state.mode, undefined, 'display mode must not become account data');
        record.state = structuredClone(payload.state);
        record.revision++;
        return json(record);
      }
      if (path === '/api/attachments' && method === 'GET') return json({ attachments: [...files.values()].map(({ bytes, ...metadata }) => metadata) });
      if (path.startsWith('/api/attachments/')) {
        const id = decodeURIComponent(path.split('/').at(-1));
        if (method === 'PUT') {
          const bytes = request.postDataBuffer();
          files.set(id, { id, name: decodeURIComponent(headers['x-anchor-filename']), type: headers['content-type'], size: bytes.length, bytes });
          return json({ ok: true });
        }
        if (method === 'GET' && files.has(id)) return route.fulfill({ status: 200, contentType: files.get(id).type, body: files.get(id).bytes });
        if (method === 'DELETE') { files.delete(id); return route.fulfill({ status: 204 }); }
      }
      if (path === '/api/session' && method === 'DELETE') {
        session.authenticated = false;
        return route.fulfill({ status: 204 });
      }
      violations.push(`Unexpected fixture endpoint: ${method} ${path}`);
      return json({ error: 'Not found' }, 404);
    });
    return session;
  }
  return { record, files, calls, violations, attach, seed: restored };
}

test('actual app guide: first-visit seven stops, replay, and reload preserve the real underlying workspace', { skip: !enabled, timeout: 60_000 }, async () => {
  const browser = await openBrowser();
  try {
    const { page, errors } = await newPage(browser);
    await loadApp(page);
    await page.locator('.anchor-guide[open] [data-guide-action="start"]').waitFor();
    const before = await storedState(page);
    assert.equal(before.demo.notices.length, 2);
    assert.equal(before.personal.notices.length, 0);
    await page.locator('[data-guide-action="start"]').click();
    const stops = [
      ['Start with a clear overview', 'overview'],
      ['Choose how to save your progress', 'overview'],
      ['Add a notice. Check the original.', 'notices'],
      ['Prepare one step at a time', 'plan'],
      ['Keep proof of what you send', 'evidence'],
      ['See the whole picture', 'continuity'],
      ['Find a person when you need one', 'support'],
    ];
    for (let index = 0; index < stops.length; index++) {
      const [title, destination] = stops[index];
      await page.locator('#anchor-guide-title').filter({ hasText: title }).waitFor();
      assert.equal(await page.locator('.anchor-guide-eyebrow').innerText(), `YOUR QUICK TOUR · ${index + 1} OF 7`);
      assert.equal(new URL(page.url()).hash, `#${destination}`);
      await page.locator('[data-guide-action="next"]').click();
    }
    assert.equal(await page.locator('.anchor-guide[open]').count(), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('anchor-guide-session-v2')), 'completed');
    assert.deepEqual(await storedState(page), before, 'the actual guide must not alter notice facts, confirmation, progress, or events');
    await page.locator('[data-action="guide"]').first().click();
    await page.locator('#anchor-guide-title').filter({ hasText: stops[0][0] }).waitFor();
    await page.locator('[data-guide-action="next"]').click();
    await page.locator('#anchor-guide-title').filter({ hasText: stops[1][0] }).waitFor();
    await page.keyboard.press('Escape');
    assert.deepEqual(await storedState(page), before, 'replaying and dismissing the guide must preserve work');
    await page.reload();
    await page.locator('.shell').waitFor();
    await page.waitForFunction(() => !document.querySelector('#app')?.inert);
    assert.equal(await page.locator('.anchor-guide[open]').count(), 0, 'returning visitors must not get another automatic walkthrough');
    assert.deepEqual(await storedState(page), before);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('actual app account UI: unconfigured Google setup is explicit and no fake sign-in control or Google request appears', { skip: !enabled, timeout: 30_000 }, async () => {
  const browser = await openBrowser();
  try {
    const { page, errors } = await newPage(browser, { skipGuide: true });
    const googleRequests = [];
    page.on('request', request => { if (new URL(request.url()).hostname === 'accounts.google.com') googleRequests.push(request.url()); });
    await loadApp(page);
    const before = await storedState(page);
    await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    await page.locator('#modal[open]').waitFor();
    assert.match(await page.locator('#modal').innerText(), /Account sign-in is being connected for this website/);
    assert.equal(await page.locator('#google-signin').evaluate(element => element.children.length), 0);
    assert.equal(await page.locator('#modal').getByRole('button', { name: /sign in with google/i }).count(), 0);
    assert.equal(await page.locator('#modal iframe').count(), 0);
    assert.equal(await page.locator('#modal a[href*="get-google-api-clientid"]').count(), 1);
    await page.getByRole('button', { name: 'Continue on this device', exact: true }).click();
    assert.equal(await page.locator('#modal[open]').count(), 0);
    assert.deepEqual(await storedState(page), before);
    assert.deepEqual(googleRequests, [], 'unconfigured UI must not load an identity library or request credentials');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('actual app with fictional authenticated API: dates, reviewed plan, originals and receipt restore on a second clean context; practice stays separate and sign-out restores guest', { skip: !enabled, timeout: 120_000 }, async () => {
  const browser = await openBrowser();
  const api = apiFixture();
  try {
    const first = await newPage(browser, { skipGuide: true });
    await api.attach(first.context);
    await loadApp(first.page);
    await first.page.getByRole('button', { name: 'Open account settings', exact: true }).waitFor();
    await first.page.locator('.save-status').filter({ hasText: 'Saved to your account' }).waitFor();
    // Restoring a verified account opens its own welcome even when this tab's
    // entry tour was dismissed. Dismiss it through the visible control.
    await first.page.locator('.anchor-guide-welcome[open]').waitFor();
    assert.match(await first.page.locator('#anchor-guide-title').innerText(), /You’re signed in/);
    await first.page.locator('.anchor-guide-welcome [data-guide-action="skip"]').last().click();
    assert.equal(await first.page.locator('.anchor-guide[open]').count(), 0);
    assert.equal(await first.page.locator('.sample-strip').count(), 0);
    const initial = await storedState(first.page, ACCOUNT_ID);
    assert.equal(initial.personal.notices[0].id, api.seed.id);
    assert.equal(initial.personal.notices[0].isDemo, false);
    await first.page.locator(`[data-action="review"][data-id="${api.seed.id}"]`).first().click();
    const submit = api.seed.deadlines.find(deadline => deadline.kind === 'submit');
    await first.page.locator(`[data-action="edit-date"][data-date="${submit.id}"]`).click();
    await first.page.locator(`input[data-date="${submit.id}"]`).fill('2026-10-16');
    await first.page.locator(`input[data-date="${submit.id}"]`).blur();
    await eventually(() => api.record.state.personal.notices[0].deadlines.find(deadline => deadline.id === submit.id)?.date === '2026-10-16', 'edited date must reach the API');
    const deadlineIds = await first.page.locator('[data-confirm]').evaluateAll(elements => elements.map(element => element.dataset.confirm));
    for (const id of deadlineIds) await first.page.locator(`[data-confirm="${id}"]`).check();
    await first.page.locator('[data-action="confirm-plan"]:not([disabled])').waitFor();
    await first.page.locator('[data-action="confirm-plan"]').click();
    await first.page.locator('.task-check').first().click();
    await eventually(() => api.record.state.personal.notices[0].reviewed && api.record.state.personal.notices[0].requests.some(request => request.status === 'done'), 'reviewed plan and prepared item must save to the account fixture');

    // Import through the actual file picker/change handler, then sync original
    // bytes before the record referring to them is considered saved.
    const upload = DEMO_NOTICES.find(notice => notice.id === 'verification');
    await first.page.locator('[data-action="import"]').first().click();
    await first.page.locator('#notice-file').setInputFiles({ name: 'fictional-uploaded-notice.txt', mimeType: 'text/plain', buffer: Buffer.from(upload.text) });
    await first.page.locator('.source-toolbar').filter({ hasText: 'fictional-uploaded-notice.txt' }).waitFor();
    await eventually(() => api.record.state.personal.notices.length === 2 && api.record.state.personal.notices.some(notice => notice.filename === 'fictional-uploaded-notice.txt' && api.files.has(notice.originalAttachmentId)), 'uploaded personal notice and its original bytes must both reach the API');
    const uploaded = api.record.state.personal.notices.find(notice => notice.filename === 'fictional-uploaded-notice.txt');
    assert.equal(uploaded.isDemo, false);
    assert.equal(api.files.get(uploaded.originalAttachmentId).bytes.toString(), upload.text);

    await nav(first.page, 'evidence');
    await first.page.locator('[data-action="receipt"]').first().click();
    await first.page.locator('#receipt-notice').selectOption(uploaded.id);
    await first.page.locator('#receipt-date').fill('2026-10-10');
    await first.page.locator('#receipt-note').fill('Fictional submission. Reference QA-ROUNDTRIP-42.');
    const receiptBytes = 'Fictional receipt for browser QA only.';
    await first.page.locator('#receipt-file').setInputFiles({ name: 'fictional-account-receipt.txt', mimeType: 'text/plain', buffer: Buffer.from(receiptBytes) });
    await first.page.locator('#receipt-form button[type="submit"]').click();
    await first.page.locator('.evidence-row').filter({ hasText: 'QA-ROUNDTRIP-42' }).waitFor();
    await eventually(() => api.record.state.personal.events.some(event => event.kind === 'submitted' && event.detail.includes('QA-ROUNDTRIP-42') && api.files.has(event.attachmentId)), 'submission record and receipt bytes must both sync');
    const receipt = api.record.state.personal.events.find(event => event.kind === 'submitted');
    assert.equal(api.files.get(receipt.attachmentId).bytes.toString(), receiptBytes);

    await first.page.locator('[data-action="workspace-demo"]').click();
    await first.page.locator('.sample-strip').waitFor();
    await nav(first.page, 'notices');
    assert.equal(await first.page.locator('.notice-card').count(), 2);
    assert.equal(await first.page.locator(`.notice-card [data-id="${uploaded.id}"]`).count(), 0);
    await first.page.locator('.save-status').filter({ hasText: 'Saved to your account' }).waitFor();
    assert.equal(api.record.state.demo, undefined);
    assert.equal(api.record.state.personal.notices.length, 2);
    assert.deepEqual(first.errors, []);
    await first.context.close();

    // Clean context has no first-device IndexedDB or identity cache. Its only
    // personal data source is the shared mock account API response.
    const second = await newPage(browser, { skipGuide: true });
    await api.attach(second.context);
    await loadApp(second.page);
    await second.page.locator('.save-status').filter({ hasText: 'Saved to your account' }).waitFor();
    await second.page.locator('.anchor-guide-welcome[open]').waitFor();
    assert.match(await second.page.locator('#anchor-guide-title').innerText(), /You’re signed in/);
    await second.page.locator('.anchor-guide-welcome [data-guide-action="skip"]').last().click();
    assert.equal(await second.page.locator('.anchor-guide[open]').count(), 0);
    const restored = await storedState(second.page, ACCOUNT_ID);
    const seed = restored.personal.notices.find(notice => notice.id === api.seed.id);
    assert.equal(seed.deadlines.find(deadline => deadline.id === submit.id).date, '2026-10-16');
    assert.equal(seed.deadlines.find(deadline => deadline.id === submit.id).originalDate, '2026-10-15');
    assert.ok(seed.deadlines.every(deadline => deadline.confirmed));
    assert.equal(seed.reviewed, true);
    assert.ok(seed.requests.some(request => request.status === 'done'));
    assert.equal(restored.personal.events.find(event => event.id === receipt.id).detail, 'Fictional submission. Reference QA-ROUNDTRIP-42.');
    assert.equal(restored.personal.notices.length, 2);
    await nav(second.page, 'notices');
    await second.page.locator(`[data-action="review"][data-id="${uploaded.id}"]`).click();
    const originalDownload = second.page.waitForEvent('download');
    await second.page.locator(`[data-action="attachment"][data-attachment="${uploaded.originalAttachmentId}"]`).click();
    const original = await originalDownload;
    assert.equal(original.suggestedFilename(), 'fictional-uploaded-notice.txt');
    assert.equal(await readFile(await original.path(), 'utf8'), upload.text);
    assert.ok(api.calls.some(call => call.method === 'GET' && call.path === `/api/attachments/${uploaded.originalAttachmentId}`));
    await nav(second.page, 'evidence');
    assert.match(await second.page.locator('.evidence-row').innerText(), /QA-ROUNDTRIP-42/);
    const receiptDownload = second.page.waitForEvent('download');
    await second.page.locator(`[data-action="attachment"][data-attachment="${receipt.attachmentId}"]`).click();
    assert.equal(await readFile(await (await receiptDownload).path(), 'utf8'), receiptBytes);
    await second.page.locator('[data-action="workspace-demo"]').click();
    await nav(second.page, 'notices');
    assert.equal(await second.page.locator('.notice-card').count(), 2);
    assert.equal(await second.page.locator(`.notice-card [data-id="${uploaded.id}"]`).count(), 0);
    await second.page.locator('[data-action="workspace-personal"]').click();
    await nav(second.page, 'assistant');
    await second.page.locator('#assistant-question').fill('Fictional private question draft for QA only');
    await second.page.locator('#assistant-adult').check();
    await second.page.getByRole('button', { name: 'Open account settings', exact: true }).click();
    await second.page.locator('[data-action="signout-account"]').click();
    await second.page.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
    await nav(second.page, 'assistant');
    assert.equal(await second.page.locator('#assistant-question').inputValue(), '', 'sign-out must clear the account question draft');
    assert.equal(await second.page.locator('#assistant-adult').isChecked(), false, 'Gemini consent must reset with the account');
    await second.page.locator('[data-action="workspace-personal"]').click();
    await nav(second.page, 'notices');
    await second.page.locator('.empty-state').waitFor();
    assert.equal((await storedState(second.page, 'guest')).personal.notices.length, 0);
    assert.equal(await storedState(second.page, ACCOUNT_ID), null, 'sign-out clears the account device copy');
    assert.equal(api.record.state.personal.notices.length, 2, 'sign-out does not delete the remote account fixture');
    assert.ok(api.calls.some(call => call.path === '/api/session' && call.method === 'DELETE'));
    assert.deepEqual(api.violations, []);
    assert.deepEqual(second.errors, []);
  } finally { await browser.close(); }
});
