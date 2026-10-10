import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const enabled = Boolean(
  process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE,
);

test(
  'browser acceptance: a pending date save preserves clarification editing and its calendar decision',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.ANCHOR_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
        : {}),
    });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Delay one completed IndexedDB write, exercising the asynchronous account
    // status/render path without connecting to a real account or uploading data.
    await context.route('**/platform.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const declaration = 'export async function saveState(value, scope = storageScope)';
      assert.ok(body.includes(declaration));
      await route.fulfill({
        response,
        body:
          body.replace(
            declaration,
            'async function underlyingSaveState(value, scope = storageScope)',
          ) +
          `
        export async function saveState(...args) {
          const result = await underlyingSaveState(...args);
          if (globalThis.__anchorTestSlowNextSave) {
            globalThis.__anchorTestSlowNextSave = false;
            globalThis.__anchorTestSaveStarted = true;
            await new Promise(resolve => setTimeout(resolve, 500));
            globalThis.__anchorTestSaveDone = true;
          }
          return result;
        }
      `,
      });
    });
    try {
      await page.addInitScript(() => localStorage.setItem('anchor-guide-v1', 'dismissed'));
      await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
      await page.locator('[data-action="import"]').first().click();
      await page.locator('[data-action="import-tab"][data-tab="sample"]').click();
      await page.locator('[data-action="add-sample"][data-id="conflicting-dates"]').click();
      await page.locator('#clarification').focus();
      const planButton = await page.locator('.sidebar [data-page="plan"]').boundingBox();
      assert.ok(planButton);
      await page.mouse.move(
        planButton.x + planButton.width / 2,
        planButton.y + planButton.height / 2,
      );
      await page.mouse.down();
      // A resident can hold a mouse/finger before releasing a navigation control.
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.locator('[data-action="calendar-all"]').waitFor();
      assert.equal(await page.evaluate(() => location.hash), '#plan');
      await page.locator('[data-action="calendar-all"]').click();
      await page.locator('#clarification').waitFor();
      for (const index of [0, 1]) {
        await page.locator('[data-confirm]').nth(index).check();
        await page.locator('.fact').nth(index).getByText('Checked', { exact: true }).waitFor();
      }
      await page.evaluate(() => {
        globalThis.__anchorTestSlowNextSave = true;
      });
      await page.locator('[data-exclude]').nth(1).check();
      await page.waitForFunction(() => globalThis.__anchorTestSaveStarted);
      const clarification = 'Fictional county clarified October 23; October 26 does not apply.';
      await page.locator('#clarification').fill(clarification);
      await page.locator('#clarification').evaluate((el) => el.setSelectionRange(10, 20));
      await page.waitForFunction(() => globalThis.__anchorTestSaveDone);
      assert.equal(await page.locator('#clarification').inputValue(), clarification);
      assert.deepEqual(
        await page.locator('#clarification').evaluate((el) => ({
          focused: document.activeElement === el,
          start: el.selectionStart,
          end: el.selectionEnd,
        })),
        { focused: true, start: 10, end: 20 },
        'a background save must not interrupt the resident editing a clarification',
      );
      await page.locator('#clarification').blur();
      await page.locator('[data-action="confirm-plan"]:not([disabled])').waitFor();
      await page.locator('[data-action="confirm-plan"]').click();
      const downloadPromise = page.waitForEvent('download');
      await page.locator('[data-action="calendar-all"]').click();
      const calendar = await readFile(await (await downloadPromise).path(), 'utf8');
      assert.match(calendar, /20261023/);
      assert.doesNotMatch(calendar, /DTSTART;VALUE=DATE:20261026/);
      await page.reload();
      await page.locator('.shell').waitFor();
      const saved = await page.evaluate(async () => {
        const storage = await import(new URL('platform.js', location.href).href);
        return storage.loadState('guest');
      });
      const notice = saved.demo.notices.find((item) => item.clarification === clarification);
      assert.ok(notice?.reviewed, 'the checked plan and clarification survive a reload');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
