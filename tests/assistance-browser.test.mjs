import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

// Actual-app regression checks always use an isolated profile and fictional
// records. Calendar authorization and HTTP writes are intercepted; no Google
// account, cloud workspace, or real calendar event is used by these tests.
const enabled = Boolean(
  process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE,
);
const baseURL = process.env.ANCHOR_BROWSER_TEST_URL;

async function openBrowser() {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  return chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
      : {}),
  });
}

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'));
  return { context, page, errors };
}

async function loadApp(page) {
  await page.goto(baseURL);
  await page.locator('.shell').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app')?.inert);
}

async function stored(page) {
  return page.evaluate(async () => {
    const storage = await import(new URL('platform.js', location.href).href);
    return storage.loadState('guest');
  });
}

async function nav(page, destination) {
  await page.locator(`.sidebar [data-action="nav"][data-page="${destination}"]`).click();
}

async function ask(page, question) {
  await page.locator('#assistant-question').fill(question);
  await page.locator('#assistant-form button[type="submit"]').click();
  await page.locator('.assistant-message').last().waitFor();
  return page.locator('.assistant-message').last();
}

test(
  'assistance app: renewal opens the real CF37 and saves a guided unsigned draft across steps and refresh',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      await loadApp(page);
      await page.locator('[data-action="review"][data-id="demo-renewal"]').first().click();
      const count = await page.locator('[data-confirm]').count();
      assert.equal(count, 3);
      await page.locator('.review-card [data-action="source"].anchor-next-action-target').waitFor();
      assert.equal(
        await page.locator('.anchor-next-step-continue').innerText(),
        'Show original wording',
      );
      await page.locator('.anchor-next-step-continue').click();
      assert.equal(
        await page.locator('[data-confirm]:checked').count(),
        0,
        'the hint opens the original without confirming any date',
      );
      for (let index = 0; index < count; index++) {
        await page.locator('[data-confirm]').nth(index).check();
        await page.waitForFunction(async (index) => {
          const storage = await import(new URL('platform.js', location.href).href);
          const state = await storage.loadState('guest');
          return state.demo.notices.find((notice) => notice.id === 'demo-renewal')?.deadlines[index]
            ?.confirmed;
        }, index);
      }
      await page.locator('[data-action="confirm-plan"]:not([disabled])').waitFor();
      await page.locator('.anchor-next-step:not([hidden])').waitFor();
      assert.equal(
        await page.locator('[data-action="confirm-plan"].anchor-next-action-target').count(),
        1,
      );
      await page.locator('.anchor-next-step-continue').click();
      await page.locator('.tasks-panel').waitFor();
      assert.equal(
        await page.locator('[data-action="form-open"].anchor-next-action-target').count(),
        1,
      );
      await page.locator('[data-action="form-open"][data-id="demo-renewal"]').first().click();
      await page.locator('#form-assistance-draft').waitFor();
      await page.locator('#form-preview-status').filter({ hasText: 'Official blank' }).waitFor();
      assert.match(await page.locator('.form-assist-viewer-head').innerText(), /Page 8 \/ 11/);
      assert.equal(
        await page
          .locator('#form-preview-canvas')
          .evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
        true,
      );
      assert.equal(await page.locator('.form-assist-document iframe').count(), 0);
      await page.locator('#form-field-caseName').fill('Fictional QA Resident');
      await page
        .locator('.form-assist-step-buttons [data-action="form-section"][data-section="1"]')
        .click();
      await page.locator('#form-assist-section-title').filter({ hasText: 'Household' }).waitFor();
      let state = await stored(page);
      const renewal = state.demo.notices.find((notice) => notice.id === 'demo-renewal');
      assert.equal(renewal.formDrafts[0].draft.answers.caseName, 'Fictional QA Resident');
      assert.ok(
        renewal.requests.every((request) => request.status !== 'done'),
        'saving answers must not complete the requested action',
      );
      assert.equal(state.demo.events.filter((event) => event.kind === 'submitted').length, 0);
      await page.locator('[data-action="close-modal"]').click();
      await page.reload();
      await page.locator('.tasks-panel').waitFor();
      await page.waitForFunction(() => !document.querySelector('#app')?.inert);
      await page.locator('[data-action="form-open"][data-id="demo-renewal"]').first().click();
      assert.equal(
        await page.locator('#form-field-caseName').inputValue(),
        'Fictional QA Resident',
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.equal(
        await page
          .locator('.form-assistance')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      );
      state = await stored(page);
      assert.equal(
        state.personal.notices.length,
        0,
        'the practice draft stays separate from personal records',
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'assistance app: an unknown notice gets a preparation guide and local actual-form viewer without guessed PDF mappings',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      await loadApp(page);
      await page.locator('[data-action="import"]').first().click();
      await page.locator('[data-action="import-tab"][data-tab="paste"]').click();
      await page.locator('#notice-name').fill('Fictional unsupported service notice');
      await page
        .locator('#notice-text')
        .fill(
          'FICTIONAL QA ONLY\nExample Local Services\nPlease complete the attached application form.\nReturn the requested form by November 18, 2026.',
        );
      await page.locator('#paste-form button[type="submit"]').click();
      await page.locator('.source-paper').waitFor();
      await nav(page, 'forms');
      await page.locator('[data-action="form-open"]').first().click();
      await page.locator('#form-assistance-draft').waitFor();
      assert.equal(await page.locator('[data-action="form-export-pdf"]').count(), 0);
      assert.equal(await page.locator('.form-assist-empty-preview').count(), 1);
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Fictional agency form for the local viewer test.');
      await page.locator('#form-source-file').setInputFiles({
        name: 'fictional-actual-form.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(await pdf.save()),
      });
      await page
        .locator('#form-preview-status')
        .filter({ hasText: 'Your attached form' })
        .waitFor();
      assert.equal(
        await page.locator('#form-preview-canvas').evaluate((canvas) => canvas.width > 0),
        true,
      );
      assert.equal(
        await page.locator('[data-action="form-export-pdf"]').count(),
        0,
        'an uploaded PDF must not inherit mappings from an unrelated official form',
      );
      const state = await stored(page);
      assert.equal(state.personal.notices.length, 1);
      assert.equal(state.personal.notices[0].supported, false);
      assert.ok(state.personal.notices[0].formDrafts[0].attachmentId);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'assistance app: source-guidance chat cites agencies, navigates to forms, and keeps unsafe personal questions local and escaped',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      const cloudRequests = [];
      page.on('request', (request) => {
        if (
          /functions\/v1\/anchor-assistant|generativelanguage\.googleapis\.com/.test(request.url())
        )
          cloudRequests.push(request.url());
      });
      await loadApp(page);
      const before = await stored(page);
      await nav(page, 'assistant');
      await page
        .locator('[data-action="assistant-example"][data-question="How do I renew CalFresh?"]')
        .click();
      assert.equal(
        await page.locator('#assistant-question').inputValue(),
        'How do I renew CalFresh?',
      );
      const answer = await ask(page, 'How do I renew CalFresh?');
      await answer.locator('.assistant-answer').waitFor();
      assert.equal(await page.locator('#assistant-question').inputValue(), '');
      assert.match(await answer.innerText(), /Source guide/);
      assert.ok((await answer.locator('.assistant-sources a[href*="cdss.ca.gov"]').count()) > 0);
      assert.ok(
        !/approved|guaranteed/i.test(await answer.locator('.assistant-answer').innerText()),
      );
      const navigation = await ask(page, 'Where can I fill out a form?');
      await navigation.locator('[data-action="assistant-nav"][data-page="forms"]').click();
      assert.equal(new URL(page.url()).hash, '#forms');
      await nav(page, 'assistant');
      const unsafe = '<img src=x onerror="window.chatInjected=true"> My case number is 123456789.';
      const privateMessage = await ask(page, unsafe);
      assert.equal(await privateMessage.locator('.assistant-question').innerText(), unsafe);
      assert.equal(await page.locator('#assistant-question').inputValue(), '');
      assert.match(await privateMessage.innerText(), /private|personal|case-specific/i);
      assert.equal(
        await page.locator('.assistant-messages img, .assistant-messages script').count(),
        0,
      );
      assert.equal(await page.evaluate(() => window.chatInjected), undefined);
      assert.deepEqual(cloudRequests, []);
      assert.deepEqual(
        await stored(page),
        before,
        'the temporary chatbot conversation must not be saved with notices or form answers',
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'assistance app: Calendar needs preview confirmation and duplicate inserts preserve existing event edits',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { context, page, errors } = await newPage(browser);
      // A public fixture Client ID enables the optional Calendar UI while the
      // Supabase account remains deliberately unconfigured and device-only.
      await context.route('**/config.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export const settings=Object.freeze({supabaseUrl:'',supabasePublishableKey:'',googleClientId:'fictional-qa.apps.googleusercontent.com',basePath:'/Anchor/',configured:false});export const publicConfig=settings;`,
        }),
      );
      await page.addInitScript(() => {
        window.calendarTokenRequests = 0;
        window.google = {
          accounts: {
            oauth2: {
              initTokenClient(config) {
                return {
                  requestAccessToken() {
                    window.calendarTokenRequests++;
                    queueMicrotask(() =>
                      config.callback({
                        access_token: 'fictional-memory-calendar-token',
                        expires_in: 3600,
                        scope: 'https://www.googleapis.com/auth/calendar.events.owned',
                        token_type: 'Bearer',
                      }),
                    );
                  },
                };
              },
              hasGrantedAllScopes: () => true,
            },
          },
        };
      });
      const writes = [],
        events = new Map();
      await context.route('https://www.googleapis.com/calendar/v3/**', async (route) => {
        const request = route.request();
        assert.equal(request.method(), 'POST');
        assert.equal(new URL(request.url()).pathname, '/calendar/v3/calendars/primary/events');
        const event = request.postDataJSON();
        writes.push(event);
        if (events.has(event.id))
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: { errors: [{ reason: 'duplicate' }] } }),
          });
        events.set(event.id, structuredClone(event));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: event.id,
            htmlLink: 'https://calendar.google.com/calendar/event?eid=fictional',
          }),
        });
      });
      await loadApp(page);
      await page.evaluate(async () => {
        const engine = await import(new URL('engine.js', location.href).href);
        const storage = await import(new URL('platform.js', location.href).href);
        const data = await import(new URL('data.js', location.href).href);
        const state = await storage.loadState('guest');
        const sample = data.DEMO_NOTICES.find((notice) => notice.id === 'renewal');
        const notice = engine.analyzeNotice(sample.text, {
          id: 'fictional-private-calendar-notice',
          filename: 'fictional-case-123456789.txt',
          isDemo: false,
        });
        notice.reviewed = true;
        notice.deadlines.forEach((date) => {
          date.confirmed = true;
        });
        state.mode = 'personal';
        state.personal = { notices: [notice], events: [] };
        await storage.saveState(state, 'guest');
      });
      await page.reload();
      await page.locator('.shell').waitFor();
      await page.waitForFunction(() => !document.querySelector('#app')?.inert);
      await nav(page, 'calendar');
      await page.locator('[data-action="calendar-connect"]:not([disabled])').waitFor();
      assert.equal(await page.locator('#calendar-form input[name="event"]').count(), 3);
      assert.equal(await page.evaluate(() => window.calendarTokenRequests), 0);
      assert.equal(writes.length, 0);
      await page.locator('#calendar-form input[name="event"]').nth(1).uncheck();
      await page.locator('#calendar-form input[name="event"]').nth(2).uncheck();
      await page.locator('[data-action="calendar-connect"]').click();
      await page.locator('[data-action="calendar-create"]').waitFor();
      assert.equal(writes.length, 0, 'authorization alone must not create an event');
      assert.equal(await page.evaluate(() => window.calendarTokenRequests), 1);
      await page.locator('#modal [data-action="close-modal"]').last().click();
      assert.equal(writes.length, 0, 'canceling preview must not write an event');
      await page.locator('[data-action="calendar-connect"]').click();
      await page.locator('[data-action="calendar-create"]').click();
      await page.waitForFunction(() => !document.querySelector('#modal')?.open);
      assert.equal(writes.length, 1);
      assert.equal(events.size, 1);
      const [id, event] = [...events][0];
      assert.equal(event.visibility, 'private');
      assert.equal(event.start.date, '2026-10-15');
      assert.equal(event.end.date, '2026-10-16');
      assert.ok(!JSON.stringify(event).includes('fictional-private-calendar-notice'));
      assert.ok(!JSON.stringify(event).includes('123456789'));
      event.summary = 'The resident edited this event in Google Calendar';
      events.set(id, event);
      // Rendering restores the date chooser; select that same one again.
      await page.locator('#calendar-form input[name="event"]').nth(1).uncheck();
      await page.locator('#calendar-form input[name="event"]').nth(2).uncheck();
      await page.locator('[data-action="calendar-connect"]').click();
      await page.locator('[data-action="calendar-create"]').click();
      await page.waitForFunction(() => !document.querySelector('#modal')?.open);
      assert.equal(writes.length, 2);
      assert.equal(events.size, 1);
      assert.equal(events.get(id).summary, 'The resident edited this event in Google Calendar');
      assert.equal(writes[0].id, writes[1].id);
      assert.ok(!JSON.stringify(await stored(page)).includes('fictional-memory-calendar-token'));
      await page.reload();
      await page
        .locator('[data-action="calendar-connect"]')
        .filter({ hasText: 'Connect Google Calendar' })
        .waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
