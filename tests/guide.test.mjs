import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guideSteps, GUIDE_STORAGE_KEY } from '../web/guide.js';

test('walkthrough covers navigation, account storage, original review, plan, receipts and human help', () => {
  const steps = guideSteps();
  assert.equal(steps.length, 6);
  assert.deepEqual(steps.map(step => step.id), ['overview', 'account', 'notices', 'plan', 'evidence', 'support']);
  assert.match(steps[1].body, /Google/);
  assert.match(steps[1].body, /guest.*device/i);
  assert.match(steps[2].body, /exact wording/);
  assert.match(steps[3].tip, /does not send/);
  assert.match(steps[4].tip, /does not confirm county acceptance/);
  assert.ok(steps.every(step => step.title && step.body && step.tip && step.page));
  assert.equal(GUIDE_STORAGE_KEY, 'anchor-guide-v1');
});

test('Spanish walkthrough has the same destinations and complete copy', () => {
  const english = guideSteps('en'), spanish = guideSteps('es');
  assert.deepEqual(spanish.map(({ id, page }) => ({ id, page })), english.map(({ id, page }) => ({ id, page })));
  assert.ok(spanish.every((step, index) => step.title !== english[index].title && step.body !== english[index].body && step.tip !== english[index].tip));
  assert.deepEqual(guideSteps('unknown'), english);
});

const browserEnabled = Boolean(process.env.ANCHOR_PLAYWRIGHT_MODULE && process.env.ANCHOR_BROWSER_TEST_URL);
const source = await readFile(new URL('../web/guide.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/guide.css', import.meta.url), 'utf8');
const fixtureHTML = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{margin:0;font:16px Arial;background:#f5f6ee}header{height:60px;display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:0 20px}.nav{position:fixed;left:0;top:80px;width:210px;display:grid;gap:10px}.nav button{height:45px}.content{margin-left:230px;padding:20px}.page-head{padding:15px;border:1px solid #ccd9c2}@media(max-width:700px){.nav{transform:translateX(-110%)}.content{margin-left:0;padding:14px}}button{font:inherit}
</style><header><button data-action="account">Sign in</button><button id="guide-button" data-action="guide">Guide</button></header><nav class="nav">${['overview', 'notices', 'plan', 'evidence', 'support'].map(page => `<button data-action="nav" data-page="${page}">${page}</button>`).join('')}</nav><main id="main" class="content" tabindex="-1"><div class="page-head"><h1>overview</h1></div></main><dialog id="modal"></dialog>`;
async function installFixture(page, lang = 'en') {
  await page.goto(new URL('/guide-fixture', process.env.ANCHOR_BROWSER_TEST_URL).href);
  await page.addStyleTag({ content: css });
  await page.evaluate(async ({ source, lang }) => {
    const { createGuide } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
    window.fixtureState = { lang, mode: 'personal', personal: { notices: [{ id: 'keep', confirmed: false }], events: [] } };
    window.fixtureBefore = JSON.stringify(window.fixtureState);
    window.guideRoutes = [];
    window.guide = createGuide({
      getState: () => window.fixtureState,
      navigate(page) {
        window.guideRoutes.push(page);
        document.querySelector('#main').innerHTML = `<div class="page-head"><h1>${page}</h1></div>`;
        window.guide?.refresh();
      }
    });
    document.querySelector('#guide-button').onclick = () => window.guide.start();
    document.querySelector('#guide-button').focus();
    window.guideDidAutoStart = window.guide.autoStart();
  }, { source, lang });
}
async function guideBrowser({ mobile = false } = {}) {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.route('**/guide-fixture', route => route.fulfill({ contentType: 'text/html', body: fixtureHTML }));
  return { browser, page };
}

test('browser guide: first visit, focus containment, complete navigation, replay and preserved workspace', { skip: !browserEnabled, timeout: 30_000 }, async () => {
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
    await page.locator('#anchor-guide-title').filter({ hasText: 'Start with a clear overview' }).waitFor();
    await page.locator('[data-guide-action="next"]').click();
    await page.locator('#anchor-guide-title').filter({ hasText: 'Choose how to save' }).waitFor();
    await page.locator('[data-guide-action="next"]').click();
    await page.locator('#main h1').filter({ hasText: 'notices' }).waitFor();
    await page.locator('[data-guide-action="back"]').click();
    await page.locator('#main h1').filter({ hasText: 'overview' }).waitFor();
    await page.locator('[data-guide-action="next"]').click();
    for (const pageName of ['plan', 'evidence', 'support']) {
      await page.locator('[data-guide-action="next"]').click();
      await page.locator('#main h1').filter({ hasText: pageName }).waitFor();
    }
    await page.locator('[data-guide-action="next"]').click();
    assert.equal(await page.locator('.anchor-guide[open]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'guide-button');
    assert.equal(await page.evaluate(() => localStorage.getItem('anchor-guide-v1')), 'completed');
    assert.equal(await page.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore), true);
    await page.locator('#guide-button').click();
    await page.locator('.anchor-guide[open]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.anchor-guide[open]').count(), 0);
    await installFixture(page);
    assert.equal(await page.evaluate(() => window.guideDidAutoStart), false, 'returning visitors should not be interrupted');
  } finally { await browser.close(); }
});

test('browser guide: mobile Spanish tour fits screen and highlights visible content with empty personal workspace', { skip: !browserEnabled, timeout: 30_000 }, async () => {
  const { browser, page } = await guideBrowser({ mobile: true });
  try {
    await installFixture(page, 'es');
    await page.evaluate(() => { window.fixtureState.personal = { notices: [], events: [] }; window.fixtureBefore = JSON.stringify(window.fixtureState); });
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
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'guide-button');
    assert.equal(await page.evaluate(() => JSON.stringify(window.fixtureState) === window.fixtureBefore), true);
  } finally { await browser.close(); }
});
