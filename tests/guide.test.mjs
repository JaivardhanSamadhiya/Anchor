import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { guideSteps, GUIDE_STORAGE_KEY } from '../web/guide.js';

test('walkthrough covers navigation, account storage, original review, plan, receipts and human help', () => {
  const steps = guideSteps();
  assert.equal(steps.length, 9);
  assert.deepEqual(
    steps.map((step) => step.id),
    ['overview', 'account', 'notices', 'plan', 'readiness', 'evidence', 'continuity', 'library', 'support'],
  );
  assert.match(steps[1].body, /Google/);
  assert.match(steps[1].body, /guest.*device/i);
  assert.match(steps[2].body, /exact wording/);
  assert.match(steps[3].tip, /does not send/);
  assert.match(steps.find(step => step.id === 'evidence').tip, /does not confirm county acceptance/);
  assert.ok(steps.every((step) => step.title && step.body && step.tip && step.page));
  assert.equal(GUIDE_STORAGE_KEY, 'anchor-guide-session-v2');
});

test('Spanish walkthrough has the same destinations and complete copy', () => {
  const english = guideSteps('en'),
    spanish = guideSteps('es');
  assert.deepEqual(
    spanish.map(({ id, page }) => ({ id, page })),
    english.map(({ id, page }) => ({ id, page })),
  );
  assert.ok(
    spanish.every(
      (step, index) =>
        step.title !== english[index].title &&
        step.body !== english[index].body &&
        step.tip !== english[index].tip,
    ),
  );
  assert.deepEqual(guideSteps('unknown'), english);
});

const browserEnabled = Boolean(
  process.env.ANCHOR_PLAYWRIGHT_MODULE && process.env.ANCHOR_BROWSER_TEST_URL,
);
const source = await readFile(new URL('../web/guide.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/guide.css', import.meta.url), 'utf8');
const cueSource = (
  await transform(await readFile(new URL('../src/ui/next-step-cue.ts', import.meta.url), 'utf8'), {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
  })
).code;
const fixtureHTML = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{margin:0;font:16px Arial;background:#f5f6ee}header{height:60px;display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:0 20px}.nav{position:fixed;left:0;top:80px;width:210px;display:grid;gap:10px}.nav button{height:45px}.content{margin-left:230px;padding:20px}.page-head{padding:15px;border:1px solid #ccd9c2}@media(max-width:700px){.nav{transform:translateX(-110%)}.content{margin-left:0;padding:14px}}button{font:inherit}
</style><header><button data-action="account">Sign in</button><button id="guide-button" data-action="guide">Guide</button></header><nav class="nav">${['overview', 'notices', 'plan', 'readiness', 'evidence', 'continuity', 'library', 'support'].map((page) => `<button data-action="nav" data-page="${page}">${page}</button>`).join('')}</nav><main id="main" class="content" tabindex="-1"><div class="page-head"><h1>overview</h1></div></main><dialog id="modal"></dialog>`;
async function installFixture(page, lang = 'en') {
  await page.goto(new URL('/guide-fixture', process.env.ANCHOR_BROWSER_TEST_URL).href);
  await page.addStyleTag({ content: css });
  await page.evaluate(
    async ({ source, lang }) => {
      const { createGuide } = await import(
        'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
      );
      window.fixtureState = {
        lang,
        mode: 'personal',
        personal: { notices: [{ id: 'keep', confirmed: false }], events: [] },
      };
      window.fixtureBefore = JSON.stringify(window.fixtureState);
      window.guideRoutes = [];
      window.guide = createGuide({
        getState: () => window.fixtureState,
        navigate(page) {
          window.guideRoutes.push(page);
          document.querySelector('#main').innerHTML =
            `<div class="page-head"><h1>${page}</h1></div>`;
          window.guide?.refresh();
        },
      });
      document.querySelector('#guide-button').onclick = () => window.guide.start();
      document.querySelector('#guide-button').focus();
      window.guideDidAutoStart = window.guide.autoStart();
    },
    { source, lang },
  );
}
async function guideBrowser({ mobile = false } = {}) {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 960 },
  });
  const page = await context.newPage();
  await page.route('**/guide-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: fixtureHTML }),
  );
  return { browser, page };
}

test(
  'browser guide: first visit, focus containment, complete navigation, replay and preserved workspace',
  { skip: !browserEnabled, timeout: 30_000 },
  async () => {
    const { browser, page } = await guideBrowser();
    try {
      await installFixture(page);
      assert.equal(await page.evaluate(() => window.guideDidAutoStart), true);
      assert.equal(await page.locator('.anchor-guide[open]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.guideAction), 'start');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.guideAction), 'skip');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.guideAction), 'start');
      await page.locator('[data-guide-action="start"]').click();
      await page
        .locator('#anchor-guide-title')
        .filter({ hasText: 'Start with a clear overview' })
        .waitFor();
      await page.locator('[data-guide-action="next"]').click();
      await page.locator('#anchor-guide-title').filter({ hasText: 'Choose how to save' }).waitFor();
      await page.locator('[data-guide-action="next"]').click();
      await page.locator('#main h1').filter({ hasText: 'notices' }).waitFor();
      await page.locator('[data-guide-action="back"]').click();
      await page.locator('#main h1').filter({ hasText: 'overview' }).waitFor();
      await page.locator('[data-guide-action="next"]').click();
      for (const pageName of ['plan', 'readiness', 'evidence', 'continuity', 'library', 'support']) {
        await page.locator('[data-guide-action="next"]').click();
        await page.locator('#main h1').filter({ hasText: pageName }).waitFor();
      }
      await page.locator('[data-guide-action="next"]').click();
      assert.equal(await page.locator('.anchor-guide[open]').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'guide-button');
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('anchor-guide-session-v2')),
        'completed',
      );
      assert.equal(
        await page.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore),
        true,
      );
      await page.locator('#guide-button').click();
      await page.locator('.anchor-guide[open]').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.anchor-guide[open]').count(), 0);
      await installFixture(page);
      assert.equal(
        await page.evaluate(() => window.guideDidAutoStart),
        false,
        'refreshes in the same tab session should not repeat the welcome',
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  'browser guide: a new tab welcomes a returning visitor and verified sign-in reopens the guide',
  { skip: !browserEnabled, timeout: 30_000 },
  async () => {
    const { browser, page } = await guideBrowser();
    try {
      await installFixture(page);
      await page.locator('[data-guide-action="skip"]').first().click();
      await page.evaluate(() => localStorage.setItem('anchor-guide-v1', 'completed'));
      const second = await page.context().newPage();
      await second.route('**/guide-fixture', (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHTML }),
      );
      await installFixture(second);
      assert.equal(
        await second.evaluate(() => window.guideDidAutoStart),
        true,
        'an old permanent dismissal must not suppress the tour in a new tab',
      );
      await second.locator('[data-guide-action="skip"]').first().click();
      assert.equal(await second.evaluate(() => window.guide.afterSignIn()), true);
      assert.match(await second.locator('#anchor-guide-title').innerText(), /signed in/);
      assert.equal(
        await second.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore),
        true,
      );
      await second.keyboard.press('Escape');
      assert.equal(
        await second.evaluate(() => {
          document.querySelector('#modal').showModal();
          return window.guide.afterSignIn();
        }),
        false,
        'a sign-in welcome should wait for an existing dialog to close',
      );
      assert.equal(await second.locator('.anchor-guide[open]').count(), 0);
      await second.evaluate(() => {
        document.querySelector('#modal').close();
        window.guide.refresh();
      });
      await second.locator('.anchor-guide[open]').waitFor();
      assert.match(await second.locator('#anchor-guide-title').innerText(), /signed in/);
      await second.keyboard.press('Escape');
      await second.evaluate(() => window.guide.refresh());
      assert.equal(
        await second.locator('.anchor-guide[open]').count(),
        0,
        'a completed account transition only welcomes once',
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  'browser next step: cues activate the existing control, preserve accessibility, and suspend during dialogs',
  { skip: !browserEnabled, timeout: 30_000 },
  async () => {
    const { browser, page } = await guideBrowser({ mobile: true });
    try {
      await installFixture(page);
      await page.keyboard.press('Escape');
      await page.evaluate(async (source) => {
        const { createNextStepCue } = await import(
          'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
        );
        document.querySelector('#main').innerHTML =
          '<p id="existing-help">Review the original letter.</p><button id="next-control" aria-describedby="existing-help">Review my notice</button><button id="blocked-control" disabled>Use plan</button>';
        window.actionCount = 0;
        document
          .querySelector('#next-control')
          .addEventListener('click', () => window.actionCount++);
        window.cue = createNextStepCue();
        window.cue.update({
          key: 'notice-review',
          selector: '#next-control',
          title: 'Check the original notice',
          detail: 'Confirm its dates before using your plan.',
        });
      }, cueSource);
      await page.locator('.anchor-next-step:not([hidden])').waitFor();
      assert.equal(await page.locator('#next-control.anchor-next-action-target').count(), 1);
      assert.equal(
        await page.locator('#next-control').getAttribute('aria-describedby'),
        'existing-help anchor-next-step-description',
      );
      const card = await page.locator('.anchor-next-step').boundingBox();
      assert.ok(
        card.x >= 0 && card.x + card.width <= 391 && card.y >= 0 && card.y + card.height <= 845,
      );
      await page.evaluate(() => document.querySelector('#modal').showModal());
      await page.locator('.anchor-next-step[hidden]').waitFor({ state: 'attached' });
      assert.equal(
        await page.locator('#next-control').getAttribute('aria-describedby'),
        'existing-help',
      );
      await page.evaluate(() => document.querySelector('#modal').close());
      await page.locator('.anchor-next-step:not([hidden])').waitFor();
      await page.locator('.anchor-next-step-continue').click();
      assert.equal(await page.evaluate(() => window.actionCount), 1);
      assert.equal(await page.locator('.anchor-next-step[hidden]').count(), 1);
      assert.equal(
        await page.locator('#next-control').getAttribute('aria-describedby'),
        'existing-help',
      );
      await page.evaluate(() =>
        window.cue.update({
          key: 'notice-review',
          selector: '#next-control',
          title: 'Check again',
        }),
      );
      assert.equal(
        await page.locator('.anchor-next-step[hidden]').count(),
        1,
        'activation dismisses that workflow stage',
      );
      await page.evaluate(() =>
        window.cue.update({ key: 'plan', selector: '#blocked-control', title: 'Use this plan' }),
      );
      assert.equal(
        await page.locator('.anchor-next-step[hidden]').count(),
        1,
        'a disabled control must never be promoted',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() =>
        window.cue.update({
          key: 'next-stage',
          selector: '#next-control',
          title: '<script>unsafe</script>',
        }),
      );
      assert.equal(
        await page.locator('.anchor-next-step-title').innerText(),
        '<script>unsafe</script>',
      );
      assert.equal(await page.locator('.anchor-next-step script').count(), 0);
      assert.equal(
        await page
          .locator('#next-control')
          .evaluate((element) => getComputedStyle(element).animationName),
        'none',
      );
      await page.locator('.anchor-next-step-dismiss').click();
      assert.equal(await page.locator('.anchor-next-step[hidden]').count(), 1);
      await page.evaluate(() => window.cue.destroy());
      assert.equal(await page.locator('.anchor-next-step').count(), 0);
      assert.equal(
        await page.locator('#next-control').getAttribute('aria-describedby'),
        'existing-help',
      );
      assert.equal(
        await page.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore),
        true,
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  'browser guide: mobile Spanish tour fits screen and highlights visible content with empty personal workspace',
  { skip: !browserEnabled, timeout: 30_000 },
  async () => {
    const { browser, page } = await guideBrowser({ mobile: true });
    try {
      await installFixture(page, 'es');
      await page.evaluate(() => {
        window.fixtureState.personal = { notices: [], events: [] };
        window.fixtureBefore = JSON.stringify(window.fixtureState);
      });
      await page.locator('[data-guide-action="start"]').click();
      for (let i = 0; i < 3; i++) {
        await page.locator('.anchor-guide-card').waitFor();
        await page.waitForTimeout(80);
        const bounds = await page.locator('.anchor-guide-card').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845);
        const spotlight = await page.locator('.anchor-guide-spotlight').boundingBox();
        assert.ok(spotlight.x >= 0 && spotlight.y >= 0 && spotlight.x + spotlight.width <= 391);
        await page.locator('[data-guide-action="next"]').click();
      }
      assert.match(await page.locator('#anchor-guide-title').innerText(), /Prepara un paso/);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'guide-button');
      assert.equal(
        await page.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore),
        true,
      );
    } finally {
      await browser.close();
    }
  },
);
