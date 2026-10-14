import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the shipped controller and its real lookup transport. The address,
// account, and public ZIP response are fixtures; no resident data or real AI is used.
const enabled = Boolean(
  process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE,
);
const firstQuestion = 'I live at 123 Fictional Street. Is San Jose my mailing city?';
const postalFixture = {
  'post code': '95124',
  country: 'United States',
  'country abbreviation': 'US',
  places: [
    {
      'place name': 'San Jose',
      state: 'California',
      'state abbreviation': 'CA',
      latitude: '37.25',
      longitude: '-121.92',
    },
  ],
};

async function withController(callback, lookupResponse = { status: 200, body: postalFixture }) {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const lookups = [];
    let markLookupStarted;
    const lookupStarted = new Promise((resolve) => {
      markLookupStarted = resolve;
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://api.zippopotam.us/**', async (route) => {
      const request = route.request();
      lookups.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
        headers: request.headers(),
      });
      markLookupStarted();
      if (typeof lookupResponse === 'function') {
        await lookupResponse(route);
      } else if (lookupResponse.abort) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: lookupResponse.status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(lookupResponse.body),
        });
      }
    });
    await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'));
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
    await page.locator('.shell').waitFor();
    await page.waitForFunction(() => !document.querySelector('#app')?.inert);
    await page.evaluate(async () => {
      const { createFormAssistant } = await import(
        new URL('form-assistant-controller.js', location.href).href
      );
      const { getFormAssistance } = await import(new URL('form-assistance.js', location.href).href);
      const { sourceGuidance } = await import(new URL('program-assistant.js', location.href).href);
      const current = {
        assistance: getFormAssistance({
          id: 'fictional-postal-followup',
          supported: true,
          program: 'CalFresh',
          type: 'renewal',
          sourceText: 'Fictional CF 37 recertification request.',
          deadlines: [],
          requests: [
            {
              id: 'form',
              kind: 'form',
              title: 'Return CF 37',
              quote: 'Return CF 37',
              status: 'todo',
            },
          ],
        }),
        section: 0,
      };
      const host = document.createElement('div');
      document.body.append(host);
      const calls = [];
      const helper = createFormAssistant({
        getForm: () => current,
        getAccount: () => ({ authenticated: true }),
        getLanguage: () => 'en',
        redraw: () => {
          host.innerHTML = helper.view();
        },
        ask: async (request) => {
          calls.push(request);
          return sourceGuidance(request);
        },
      });
      host.innerHTML = helper.view();
      helper.choose('identity', 'mailingCity');
      const snapshot = () => ({
        calls,
        answers: [...host.querySelectorAll('.form-assistant-answer')].map((answer) => ({
          text: answer.textContent,
          label: answer.querySelector('.form-assistant-answer-label')?.textContent || '',
          urls: [...answer.querySelectorAll('a')].map((link) => link.href),
        })),
        draft: host.querySelector('#form-assistant-question')?.value || '',
      });
      const start = (question) => {
        host.querySelector('#form-assistant-question').value = question;
        host.querySelector('#form-assistant-adult').checked = true;
        return helper.submit(host.querySelector('form'));
      };
      window.postalBrowserFixture = {
        submit: async (question) => {
          await start(question);
          return snapshot();
        },
        start: (question) => {
          window.postalBrowserFixture.pending = start(question);
        },
        reset: () => {
          helper.reset();
          host.innerHTML = helper.view();
        },
        finish: async () => {
          await window.postalBrowserFixture.pending;
          return snapshot();
        },
        snapshot,
      };
    });
    await callback({ page, context, lookups, lookupStarted });
    assert.deepEqual(errors, [], 'the shipped controller has no browser errors');
  } finally {
    await browser.close();
  }
}

const submit = (page, question) =>
  page.evaluate((value) => window.postalBrowserFixture.submit(value), question);

function assertPrivateLookup(lookups) {
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].url, 'https://api.zippopotam.us/us/95124');
  assert.equal(lookups[0].method, 'GET');
  assert.equal(lookups[0].body, null);
  assert.equal(lookups[0].headers.cookie, undefined);
  assert.equal(lookups[0].headers.authorization, undefined);
  assert.equal(lookups[0].headers.referer, undefined);
  assert.doesNotMatch(JSON.stringify(lookups), /Fictional|123 Fictional|mailing city/i);
}

for (const followup of [
  'My ZIP code is 95124. I am unsure of the mailing city; please tell me.',
  '95124',
]) {
  test(
    `a city question followed by ${followup === '95124' ? 'a bare ZIP' : 'an explicit ZIP'} answers the lookup without AI`,
    { skip: !enabled, timeout: 60_000 },
    async () => {
      await withController(async ({ page, lookups }) => {
        const first = await submit(page, firstQuestion);
        assert.equal(first.calls.length, 0);
        assert.equal(lookups.length, 0, 'a street question alone must not start a lookup');
        assert.equal(first.answers.at(-1).label, 'Anchor · On-device help');
        assert.match(first.answers.at(-1).text, /ZIP/i);
        const result = await submit(page, followup);
        assert.equal(result.calls.length, 0, 'even an authenticated adult sends no AI request');
        const answer = result.answers.at(-1);
        assert.equal(answer.label, 'Anchor · ZIP lookup');
        assert.match(answer.text, /San Jose/);
        assert.match(answer.text, /California|\bCA\b/);
        assert.match(answer.text, /95124/);
        assert.match(
          answer.text,
          /does not|doesn’t|doesn't|not verified|not verify|cannot|can’t|can't/i,
        );
        assert.match(answer.text, /street|full address/i);
        assert.equal(result.draft, '');
        assertPrivateLookup(lookups);
      });
    },
  );
}

test(
  'a five-digit case number is not mistaken for a ZIP even during a city follow-up',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    await withController(async ({ page, lookups }) => {
      await submit(page, firstQuestion);
      await submit(page, 'My case number is 12345.');
      assert.equal(lookups.length, 0);
    });
  },
);

for (const response of [
  { name: 'not found', status: 404, body: {} },
  { name: 'network unavailable', abort: true },
]) {
  test(
    `an unavailable postal lookup (${response.name}) explains the limit without AI fallback`,
    { skip: !enabled, timeout: 60_000 },
    async () => {
      await withController(async ({ page, lookups }) => {
        await submit(page, firstQuestion);
        const result = await submit(page, 'My ZIP code is 95124. What is my mailing city?');
        assert.equal(result.calls.length, 0);
        const answer = result.answers.at(-1);
        assert.match(
          answer.text,
          /unavailable|not found|found no|no entry|could not|couldn’t|couldn't|cannot|unable/i,
        );
        assert.doesNotMatch(answer.text, /San Jose/);
        assert.ok(answer.urls.includes('https://tools.usps.com/go/ZipLookup.htm'));
        assertPrivateLookup(lookups);
      }, response);
    },
  );
}

test(
  'an offline follow-up stays local and gives a truthful lookup fallback',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    await withController(async ({ page, context, lookups }) => {
      await submit(page, firstQuestion);
      await context.setOffline(true);
      const result = await submit(page, 'My ZIP code is 95124. What is my mailing city?');
      assert.equal(result.calls.length, 0);
      assert.equal(lookups.length, 0);
      const answer = result.answers.at(-1);
      assert.match(answer.text, /offline|internet|connect|unavailable/i);
      assert.doesNotMatch(answer.text, /San Jose/);
      assert.ok(answer.urls.includes('https://tools.usps.com/go/ZipLookup.htm'));
    });
  },
);

test(
  'resetting a pending postal lookup prevents late answers from crossing form boundaries',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await withController(
      async ({ page, lookups, lookupStarted }) => {
        await submit(page, firstQuestion);
        await page.evaluate(() =>
          window.postalBrowserFixture.start('My ZIP code is 95124. What is my mailing city?'),
        );
        // Wait for the routed public lookup before resetting, rather than relying
        // on an arbitrary sleep to manufacture a race.
        await lookupStarted;
        assert.equal(lookups.length, 1);
        await page.evaluate(() => window.postalBrowserFixture.reset());
        release();
        const result = await page.evaluate(() => window.postalBrowserFixture.finish());
        assert.deepEqual(result.answers, []);
        assert.equal(result.calls.length, 0);
        assert.equal(result.draft, '');
      },
      async (route) => {
        await gate;
        await route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(postalFixture),
          })
          .catch(() => {});
      },
    );
  },
);
