import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

async function loadSource(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
}
const { getFormAssistance, createFormDraft, updateFormDraft } = await loadSource(
  'src/domain/form-assistance.ts',
);
const { renderFormAssistance, renderFormAssistantPanel } = await loadSource(
  'src/ui/form-assistance-view.ts',
);
const assistance = getFormAssistance({
  id: 'fictional-ui-case',
  title: 'Fictional CalFresh request',
  supported: true,
  program: 'CalFresh',
  type: 'verification',
  sourceText: 'Please complete CF 37.',
  deadlines: [],
  requests: [{ id: 'form', kind: 'form', title: 'Complete CF 37', status: 'todo' }],
});

test('the mapped final step and persistent export area both offer the completed form first', () => {
  const html = renderFormAssistance({
    assistance,
    draft: createFormDraft(assistance),
    activeSection: assistance.sections.length - 1,
  });
  const stepButtons = html.match(/<div class="form-assist-step-buttons">([\s\S]*?)<\/div>/)[1];
  assert.match(stepButtons, /data-action="form-export-pdf">Download completed form/);
  assert.doesNotMatch(stepButtons, /form-export-notes/);
  const footer = html.slice(html.indexOf('<footer class="form-assist-export">'));
  assert.match(footer, /data-action="form-export-pdf"/);
  assert.match(footer, /unsigned draft/);
  assert.match(footer, /<details class="form-assist-extra-notes">/);
  assert.ok(
    html.indexOf('</div>\n    <footer') > html.indexOf('form-assist-workspace-scroll'),
    'the export area is outside the scrolling workspace',
  );
});

test('an uploaded form never inherits verified live-fill or completed-PDF claims', () => {
  const html = renderFormAssistance({
    assistance,
    draft: createFormDraft(assistance),
    hasAttachedForm: true,
    activeSection: assistance.sections.length - 1,
  });
  assert.doesNotMatch(html, /form-export-pdf|Appears on your live form|See your answers appear/);
  assert.match(html, /fields have not been verified/);
  assert.match(html, /data-action="form-export-notes"/);
  assert.match(html, /id="form-preview-text-layer"/);
  assert.doesNotMatch(html, /data-action="form-ask-field"/);
  assert.match(html, /id="form-assistant-submit"[^>]*disabled/);
});

test('public help controls never copy a resident answer into the assistant panel', () => {
  const draft = updateFormDraft(assistance, createFormDraft(assistance), {
    caseName: 'PRIVATE-ANSWER-SENTINEL',
  });
  const html = renderFormAssistance({ assistance, draft });
  assert.match(html, /value="PRIVATE-ANSWER-SENTINEL"/);
  assert.match(html, /data-action="form-ask-field" data-field="caseName"/);
  assert.match(html, /data-form-help-field="caseName"/);
  const panel = html.slice(
    html.indexOf('<aside class="form-assistant-panel"'),
    html.indexOf('</aside>', html.indexOf('<aside class="form-assistant-panel"')),
  );
  assert.doesNotMatch(panel, /PRIVATE-ANSWER-SENTINEL/);
  assert.match(panel, /form-assistant-context-select/);
});

test('Anchor messages and context escape markup and omit unsafe citation links', () => {
  const html = renderFormAssistantPanel({
    contextLabel: '<script>context()</script>',
    question: '</textarea><script>question()</script>',
    waiting: true,
    authenticated: true,
    messages: [
      {
        question: '<img src=x onerror=bad()>',
        answer: '<script>answer()</script>',
        mode: 'gemini',
        citations: [
          { title: '<b>Official source</b>', url: 'https://www.cdss.ca.gov/example?a=1&b=2' },
          { title: 'Unsafe', url: 'javascript:bad()' },
        ],
      },
    ],
  });
  assert.doesNotMatch(html, /<script>|<img|javascript:|>Gemini</);
  assert.match(html, /&lt;script&gt;context/);
  assert.match(html, /Anchor AI/);
  assert.match(html, /https:\/\/www.cdss.ca.gov\/example\?a=1&amp;b=2/);
  assert.match(html, /id="form-assistant-messages"[^>]*role="log"/);
  assert.match(html, /id="form-assistant-submit"[^>]*disabled/);
});

test(
  'form workspace keeps the completed-form action visible and has no mobile overflow',
  { skip: !process.env.ANCHOR_PLAYWRIGHT_MODULE },
  async () => {
    const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.ANCHOR_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
        : {}),
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const css = `${await readFile('web/styles.css', 'utf8')}\n${await readFile('web/forms.css', 'utf8')}`;
      const html = renderFormAssistance({ assistance, draft: createFormDraft(assistance) });
      await page.setContent(
        `<style>${css}</style><dialog><div class="modal-head"><h2>Complete your form</h2><button class="close-button" aria-label="Close">×</button></div>${html}</dialog>`,
      );
      await page.evaluate(() => document.querySelector('dialog').showModal());
      assert.ok(
        (await page.locator('.form-assist-document').boundingBox()).width > 440,
        'the document gets substantial desktop space',
      );
      const button = page.locator('.form-assist-export [data-action="form-export-pdf"]');
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const atEnd of [false, true]) {
          await page.locator('.form-assist-workspace-scroll').evaluate((element, atEnd) => {
            element.scrollTop = atEnd ? element.scrollHeight : 0;
          }, atEnd);
          const bounds = await button.boundingBox();
          assert.ok(
            bounds.y >= 0 && bounds.y + bounds.height <= 900,
            `download visible at ${width}px, end=${atEnd}`,
          );
          assert.equal(
            await page
              .locator('.form-assistance')
              .evaluate((element) => element.scrollWidth <= element.clientWidth),
            true,
            `no workspace overflow at ${width}px`,
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
            `no page overflow at ${width}px`,
          );
        }
      }
    } finally {
      await browser.close();
    }
  },
);
