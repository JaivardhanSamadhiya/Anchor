import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

// Exercise actual downloaded forms with fictional answers in an isolated
// browser. No real account, resident data or AI provider is used here.
const enabled = Boolean(
  process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE,
);
const base = process.env.ANCHOR_BROWSER_TEST_URL;
async function browser() {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  return chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
      : {}),
  });
}
async function pageFor(instance) {
  const context = await instance.newContext({
    serviceWorkers: 'block',
    acceptDownloads: true,
    viewport: { width: 1440, height: 950 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'));
  await page.goto(base);
  await page.locator('.shell').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app')?.inert);
  return { page, errors };
}
async function waitPreview(page, previous = '') {
  await page.waitForFunction((previous) => {
    const canvas = document.querySelector('#form-preview-canvas');
    return (
      canvas?.dataset.previewGeneration &&
      canvas.dataset.previewGeneration !== previous &&
      document
        .querySelector('#form-preview-status')
        ?.textContent.includes('answers updated locally')
    );
  }, previous);
}
async function downloadPdf(page) {
  const pending = page.waitForEvent('download');
  await page.locator('.form-assist-export [data-action="form-export-pdf"]').click();
  const result = await pending;
  assert.match(result.suggestedFilename(), /^anchor-unsigned-(cf37|sar7b)-draft\.pdf$/);
  return PDFDocument.load(await readFile(await result.path()));
}

test(
  'live CF37: typing updates the actual PDF, highlighted questions get Anchor help, and the full download preserves answers',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const instance = await browser();
    try {
      const { page, errors } = await pageFor(instance);
      await page.locator('.sidebar [data-page="forms"]').click();
      await page.locator('[data-action="form-open"][data-id="demo-renewal"]').first().click();
      await waitPreview(page);
      const before = await page.locator('#form-preview-canvas').evaluate((canvas) => ({
        generation: canvas.dataset.previewGeneration,
        pixels: canvas.toDataURL(),
      }));
      await page.locator('#form-field-caseName').fill('Fictional QA Resident');
      await waitPreview(page, before.generation);
      assert.notEqual(
        await page.locator('#form-preview-canvas').evaluate((canvas) => canvas.toDataURL()),
        before.pixels,
        'the actual rendered PDF gains visible answer ink',
      );
      assert.equal(
        await page.locator('#form-field-caseName').inputValue(),
        'Fictional QA Resident',
      );
      assert.equal(
        await page
          .locator('#form-field-caseName')
          .evaluate((input) => document.activeElement === input),
        true,
        'live rendering preserves typing focus',
      );
      assert.match(await page.locator('[data-form-page-label]').innerText(), /8 \/ 11/);
      assert.ok((await page.locator('#form-preview-text-layer span').count()) > 30);
      await page.locator('#form-preview-text-layer').evaluate((layer) => {
        const span =
          [...layer.querySelectorAll('span')].find((node) =>
            /case.*name/i.test(node.textContent),
          ) || layer.querySelector('span');
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        layer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      });
      await page.locator('[data-action="form-ask-selection"]').click();
      assert.match(await page.locator('#form-assistant-context').innerText(), /CF 37/);
      await page.locator('#form-assistant-question').fill('How do I answer this question?');
      await page.locator('#form-assistant-submit').click();
      await page.locator('.form-assistant-answer .form-assistant-citations a').first().waitFor();
      assert.match(
        await page.locator('.form-assistant-answer').last().innerText(),
        /Official guide/i,
      );
      assert.equal(await page.locator('#form-assistant-question').inputValue(), '');
      const pdf = await downloadPdf(page);
      assert.equal(pdf.getPageCount(), 11);
      assert.equal(pdf.getForm().getTextField('case_name').getText(), 'Fictional QA Resident');
      assert.equal(
        pdf.getForm().getTextField('case_name_header').getText(),
        'Fictional QA Resident',
      );
      assert.equal(pdf.getForm().getTextField('signed_date').getText(), undefined);
      await page.screenshot({ path: 'qa/live-form-desktop.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page
          .locator('.form-assistance')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      );
      const bounds = await page
        .locator('.form-assist-export [data-action="form-export-pdf"]')
        .boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
      await page.screenshot({ path: 'qa/live-form-mobile.png' });
      await page.locator('[data-action="close-modal"]').click();
      await page.locator('[data-action="form-open"][data-id="demo-renewal"]').first().click();
      assert.equal(await page.locator('.form-assistant-turn').count(), 0, 'form chat is temporary');
      assert.equal(await page.locator('#form-assistant-question').inputValue(), '');
      assert.deepEqual(errors, []);
    } finally {
      await instance.close();
    }
  },
);

test(
  'live SAR7: page jumps follow answer location and all 14 pages download with canonical values',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const instance = await browser();
    try {
      const { page, errors } = await pageFor(instance);
      await page.evaluate(async () => {
        const storage = await import(new URL('platform.js', location.href).href);
        const state = await storage.loadState('guest');
        state.mode = 'personal';
        state.personal.notices.push({
          id: 'fictional-sar7',
          title: 'Fictional SAR 7 request',
          supported: true,
          program: 'CalFresh',
          type: 'verification',
          sourceText: 'CalFresh: Return SAR 7B with the requested proof.',
          deadlines: [],
          requests: [
            {
              id: 'sar7-form',
              kind: 'form',
              title: 'Return SAR 7B',
              quote: 'Return SAR 7B',
              status: 'todo',
            },
          ],
          reviewed: true,
        });
        await storage.saveState(state, 'guest');
      });
      await page.goto(`${base}#forms`);
      await page.reload();
      await page.locator('[data-action="form-open"][data-id="fictional-sar7"]').click();
      await waitPreview(page);
      let generation = await page
        .locator('#form-preview-canvas')
        .getAttribute('data-preview-generation');
      await page.locator('#form-field-reportMonth').fill('October');
      await waitPreview(page, generation);
      generation = await page
        .locator('#form-preview-canvas')
        .getAttribute('data-preview-generation');
      await page.locator('#form-field-homePhone').fill('555-0100');
      await waitPreview(page, generation);
      assert.match(await page.locator('[data-form-page-label]').innerText(), /3 \/ 14/);
      assert.equal(await page.locator('[data-form-page-prev]').getAttribute('data-page'), '2');
      assert.equal(await page.locator('[data-form-page-next]').getAttribute('data-page'), '4');
      const pdf = await downloadPdf(page);
      assert.equal(pdf.getPageCount(), 14);
      assert.equal(pdf.getForm().getTextField('SAR7  10').getText(), 'October');
      assert.equal(pdf.getForm().getTextField('SAR7  49').getText(), '555-0100');
      for (const id of [511, 513, 515])
        assert.equal(pdf.getForm().getTextField(`SAR7  ${id}`).getText(), undefined);
      assert.deepEqual(errors, []);
    } finally {
      await instance.close();
    }
  },
);

test(
  'form assistant: private questions and selection text cannot enter AI payloads; reset aborts and clears mounted drafts',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const instance = await browser();
    try {
      const { page } = await pageFor(instance);
      const result = await page.evaluate(async () => {
        const { createFormAssistant } = await import(
          new URL('form-assistant-controller.js', location.href).href
        );
        const { getFormAssistance } = await import(
          new URL('form-assistance.js', location.href).href
        );
        const { sourceGuidance } = await import(
          new URL('program-assistant.js', location.href).href
        );
        const current = {
          assistance: getFormAssistance({
            id: 'fictional',
            supported: true,
            program: 'CalFresh',
            type: 'renewal',
            sourceText: 'CF 37',
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
        let signal, complete;
        const helper = createFormAssistant({
          getForm: () => current,
          getAccount: () => ({ authenticated: true }),
          getLanguage: () => 'en',
          redraw: () => {
            host.innerHTML = helper.view();
          },
          ask: (request, abort) => {
            calls.push(request);
            signal = abort;
            return new Promise((resolve) => {
              complete = () => resolve(sourceGuidance(request));
            });
          },
        });
        host.innerHTML = helper.view();
        helper.choose('identity', 'caseName');
        host.querySelector('#form-assistant-question').value =
          'How do I answer this? My private case number is 123456789.';
        host.querySelector('#form-assistant-adult').checked = true;
        const pending = helper.submit(host.querySelector('form'));
        helper.reset();
        helper.capture();
        host.innerHTML = helper.view();
        complete();
        await pending;
        const reset = {
          aborted: signal.aborted,
          draft: host.querySelector('textarea').value,
          messages: host.querySelectorAll('.form-assistant-turn').length,
          consent: host.querySelector('#form-assistant-adult').checked,
        };
        host.remove();
        return { calls, reset };
      });
      assert.equal(result.calls.length, 1);
      assert.deepEqual(result.calls[0].formContext, {
        formId: 'cf37',
        sectionId: 'identity',
        fieldId: 'caseName',
        help: 'how-to-answer',
      });
      assert.deepEqual(Object.keys(result.calls[0]).sort(), [
        'adultConfirmed',
        'focus',
        'formContext',
        'language',
        'program',
        'questionId',
      ]);
      assert.doesNotMatch(JSON.stringify(result.calls), /123456789|private case|How do I answer/);
      assert.deepEqual(result.reset, { aborted: true, draft: '', messages: 0, consent: false });
    } finally {
      await instance.close();
    }
  },
);
