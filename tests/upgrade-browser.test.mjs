import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDocument, decodePDFRawStream } from 'pdf-lib';

// Test the actual upgrade in fresh browser profiles with fictional records.
// These journeys never sign in, contact an AI provider, or submit to an agency.
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

async function newPage(browser, destination = 'evaluation') {
  const context = await browser.newContext({
    viewport: { width: 1380, height: 980 },
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'));
  await page.goto(`${baseURL}#${destination}`);
  await page.locator('.shell').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app')?.inert);
  return { page, errors };
}

async function stored(page) {
  return page.evaluate(async () => {
    const storage = await import(new URL('platform.js', location.href).href);
    return storage.loadState('guest');
  });
}

async function navigate(page, destination) {
  if (await page.locator('.mobile-nav-toggle').isVisible()) {
    await page.locator('.mobile-nav-toggle').click();
  }
  await page.locator(`.sidebar [data-action="nav"][data-page="${destination}"]`).click();
}

async function demo(page, language = 'en') {
  if (language !== 'en') await page.locator('#language').selectOption(language);
  await page.locator('[data-action="readiness-demo"]').click();
  await page.locator('.readiness-document').waitFor();
  return language === 'es' ? 'demo-readiness-es' : 'demo-readiness';
}

async function confirmAugust(page, id) {
  await page.locator(`[data-action="evidence-confirm"][data-id="${id}-paystub"]`).first().click();
  await page.locator('#evidence-kind').selectOption('paystub');
  await page.locator('#evidence-month').fill('2026-08');
  await page.locator('#evidence-confirm-form [name="checked"]').check();
  await page.locator('#evidence-confirm-form button[type="submit"]').click();
  await page.locator('#evidence-confirm-form').waitFor({ state: 'hidden' });
}

async function pauseRequest(page, pattern) {
  let release;
  let reached;
  const paused = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    reached = resolve;
  });
  await page.route(pattern, async (route) => {
    reached();
    await paused;
    await route.continue();
  });
  return { started, release };
}

function packetText(document) {
  const decoder = new TextDecoder('windows-1252');
  return document
    .getPages()
    .flatMap((page) => {
      const contents = page.node.Contents();
      const references = contents instanceof PDFArray ? contents.asArray() : [contents];
      return references.filter(Boolean).flatMap((reference) => {
        const raw = Buffer.from(
          decodePDFRawStream(document.context.lookup(reference)).decode(),
        ).toString('latin1');
        return [...raw.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map((match) =>
          decoder.decode(Buffer.from(match[1], 'hex')),
        );
      });
    })
    .join('\n');
}

test(
  'upgrade: the fictional wrong-month check requires confirmation and persists without completing or submitting a request',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      const id = await demo(page);
      let state = await stored(page);
      const before = state.demo.notices.find((notice) => notice.id === id);
      assert.equal(before.evidenceDocuments[0].confirmation.checked, false);
      assert.match(before.evidenceDocuments[0].text, /Reporting month: August 2026/);
      assert.match(await page.locator('.readiness-document').innerText(), /Check suggested facts/);
      await confirmAugust(page, id);
      const wrongMonth = page
        .locator('.readiness-finding')
        .filter({ hasText: /2026-09.*2026-08/s });
      await wrongMonth.waitFor();
      assert.match(await wrongMonth.innerText(), /another month|different month|reporting month/i);
      assert.match(await wrongMonth.locator('blockquote').innerText(), /September 2026/);
      await page.reload();
      await page.locator('.readiness-document').waitFor();
      await wrongMonth.waitFor();
      state = await stored(page);
      const saved = state.demo.notices.find((notice) => notice.id === id);
      assert.deepEqual(
        {
          checked: saved.evidenceDocuments[0].confirmation.checked,
          month: saved.evidenceDocuments[0].confirmation.month,
        },
        { checked: true, month: '2026-08' },
      );
      assert.equal(
        saved.requests.some((request) => request.status === 'done'),
        false,
      );
      assert.equal(
        saved.deadlines.some((deadline) => deadline.confirmed),
        false,
      );
      assert.equal(
        state.demo.events.some((event) => event.kind === 'submitted'),
        false,
      );
      assert.equal(
        state.personal.notices.length,
        0,
        'practice records stay separate from personal records',
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'upgrade: Spanish notices preserve original wording and dates while SAR7 guidance and packet copy are translated',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      const id = await demo(page, 'es');
      await confirmAugust(page, id);
      await page
        .locator('.readiness-finding')
        .filter({ hasText: 'corresponde a otro mes' })
        .waitFor();
      const state = await stored(page);
      const notice = state.demo.notices.find((item) => item.id === id);
      assert.match(notice.sourceText, /Fecha límite: 22 de octubre de 2026/);
      assert.ok(notice.deadlines.some((deadline) => deadline.date === '2026-10-22'));
      const formRequest = notice.requests.find((request) => /SAR\s*7/i.test(request.quote));
      assert.ok(formRequest, 'the Spanish request identifies the SAR7 supplied by the notice');
      await navigate(page, 'forms');
      await page
        .locator(`[data-action="form-open"][data-id="${id}"][data-task="${formRequest.id}"]`)
        .click();
      await page.locator('#form-field-reportMonth').waitFor();
      assert.equal(
        await page.locator('label[for="form-field-reportMonth"]').innerText(),
        'Mes del informe',
      );
      assert.match(
        await page.locator('#form-assist-section-title').innerText(),
        /Período del informe/,
      );
      assert.match(
        await page.locator('.form-assistance').innerText(),
        /PDF oficial.*idioma original/,
      );
      await page.waitForFunction(() => document.querySelector('#form-preview-canvas')?.width > 0);
      await page.locator('[data-action="close-modal"]').click();
      await navigate(page, 'readiness');
      await page.locator('[data-action="packet"]').click();
      await page.locator(`#appointment-packet-form [name="notice"][value="${id}"]`).check();
      await page.locator('#packet-questions').fill('¿Qué comprobantes corresponden a septiembre?');
      const pending = page.waitForEvent('download');
      await page.locator('#appointment-packet-form button[type="submit"]').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), 'anchor-appointment-packet.pdf');
      const pdf = await PDFDocument.load(await readFile(await download.path()));
      assert.match(packetText(pdf), /Todo listo para tu cita/);
      assert.match(packetText(pdf), /¿Qué comprobantes corresponden a septiembre\?/);
      assert.match(packetText(pdf), /Anchor no lo ha enviado/);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'upgrade: importing a real fictional PDF retains source coordinates and highlights exact wording on the original page',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser, 'notices');
      const pdf = await PDFDocument.create();
      const sheet = pdf.addPage([612, 792]);
      const lines = [
        'FICTIONAL QA NOTICE ONLY',
        'CalFresh CF 377.6',
        'Santa Clara County',
        'Notice date: October 9, 2026',
        'Due date: October 22, 2026',
        'Requested documents:',
        '[X] Pay stubs for September 2026',
        '[X] SAR 7 form',
        'All records are fictional. This is a browser test, not a real county notice.',
      ];
      lines.forEach((line, index) =>
        sheet.drawText(line, { x: 42, y: 735 - index * 28, size: 11 }),
      );
      await page.locator('[data-action="import"]').first().click();
      await page.locator('#notice-file').setInputFiles({
        name: 'fictional-coordinate-notice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(await pdf.save()),
      });
      await page.locator('.source-paper').waitFor();
      const state = await stored(page);
      const notice = state.personal.notices.find(
        (item) => item.filename === 'fictional-coordinate-notice.pdf',
      );
      assert.ok(notice);
      assert.equal(notice.layout.length, 1);
      assert.ok(notice.layout[0].words.length >= lines.length);
      assert.ok(
        notice.layout[0].words.every((box) => box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0),
      );
      const deadline = notice.deadlines.find((item) => item.date === '2026-10-22');
      assert.ok(deadline);
      await page
        .locator(`[data-action="source"][data-id="${notice.id}"][data-line="${deadline.line}"]`)
        .first()
        .click();
      await page.locator('[data-action="source-image"]').click();
      await page
        .locator('#original-area-status')
        .filter({ hasText: 'exact matching wording highlighted' })
        .waitFor();
      assert.equal(
        await page
          .locator('#original-area-canvas')
          .evaluate((canvas) => canvas.width > 0 && canvas.height > 0),
        true,
      );
      assert.ok((await page.locator('#original-area-boxes .source-box').count()) > 0);
      const spans = await page.locator('#original-area-boxes .source-box').evaluateAll((boxes) =>
        boxes.map((box) => ({
          left: parseFloat(box.style.left),
          top: parseFloat(box.style.top),
          width: parseFloat(box.style.width),
          height: parseFloat(box.style.height),
        })),
      );
      assert.ok(
        spans.every(
          (box) =>
            box.left >= 0 &&
            box.top >= 0 &&
            box.left + box.width <= 100.001 &&
            box.top + box.height <= 100.001,
        ),
      );
      const saved = (await stored(page)).personal.notices.find((item) => item.id === notice.id);
      assert.equal(
        saved.deadlines.some((item) => item.confirmed),
        false,
        'a highlight locates wording without confirming the date',
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'upgrade: library search, program and county filters work locally and the mobile navigation reaches each upgrade page',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser, 'library');
      const count = await page.locator('.knowledge-card').count();
      assert.ok(count >= 20);
      await page.locator('#knowledge-query').fill('NO_MATCH_FICTIONAL_QA_8293');
      await page.waitForFunction(() => document.querySelectorAll('.knowledge-card').length === 0);
      assert.match(
        await page.locator('#knowledge-results').innerText(),
        /No matching reviewed guidance/,
      );
      await page.locator('#knowledge-query').fill('renewal');
      await page.locator('.knowledge-card').first().waitFor();
      assert.ok((await page.locator('.knowledge-card').count()) < count);
      const results = await page.locator('.knowledge-card').allTextContents();
      assert.ok(results.every((text) => /renewal/i.test(text)));
      await page.locator('#knowledge-query').fill('');
      await page.locator('#knowledge-program').selectOption('calfresh');
      assert.ok(
        (await page.locator('.knowledge-card .tag').allTextContents()).every((text) =>
          text.includes('calfresh'),
        ),
      );
      await page.locator('#knowledge-county').selectOption('san-mateo');
      assert.match(await page.locator('#knowledge-results').innerText(), /san-mateo/);
      assert.doesNotMatch(await page.locator('#knowledge-results').innerText(), /santa-clara/);
      assert.ok(
        (
          await page
            .locator('.knowledge-card a')
            .evaluateAll((links) => links.map((link) => link.href))
        ).every((url) => url.startsWith('https://')),
      );
      await page.locator('#language').selectOption('es');
      await page.locator('#knowledge-query').fill('renovación');
      await page.locator('.knowledge-card').first().waitFor();
      assert.ok(
        (await page.locator('.knowledge-card').allTextContents()).every((text) =>
          /renovación/i.test(text),
        ),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      for (const destination of ['evaluation', 'readiness', 'library']) {
        await navigate(page, destination);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        assert.equal(
          await page.locator('.shell.nav-open').count(),
          0,
          'navigation closes after a destination is chosen',
        );
      }
      await navigate(page, 'about');
      await page.locator('#reading-size').selectOption('large');
      assert.equal(await page.locator('html').getAttribute('data-reading-size'), 'large');
      await navigate(page, 'library');
      await page.reload();
      await page.locator('.knowledge-card').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-reading-size'), 'large');
      assert.equal(
        await page.evaluate(() => localStorage.getItem('anchor-reading-size-v1')),
        'large',
      );
      assert.ok(
        await page
          .locator('.knowledge-card p')
          .first()
          .evaluate((paragraph) => parseFloat(getComputedStyle(paragraph).fontSize) >= 18),
      );
      await navigate(page, 'about');
      assert.equal(await page.locator('#reading-size').inputValue(), 'large');
      await navigate(page, 'readiness');
      const addButton = page.locator('[data-action="evidence-add"]');
      assert.match(await addButton.innerText(), /Agregar un comprobante/);
      assert.ok(
        await addButton.evaluate((button) => parseFloat(getComputedStyle(button).fontSize) >= 12),
      );
      await addButton.click();
      await page.locator('#evidence-add-form').waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'upgrade: appointment PDF contains only explicitly selected notices and files and records no submission',
  { skip: !enabled, timeout: 90_000 },
  async () => {
    const browser = await openBrowser();
    try {
      const { page, errors } = await newPage(browser);
      const id = await demo(page);
      await page.locator('[data-action="evidence-add"]').click();
      await page.locator('#evidence-notice').selectOption(id);
      await page.locator('#evidence-file').setInputFiles({
        name: 'fictional-excluded-proof.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'FICTIONAL QA ONLY\nEXCLUDED_FILE_CONTENT_9283\nRent receipt\nReporting month: September 2026\nMonthly rent: $900.00',
        ),
      });
      await page.locator('#evidence-add-form button[type="submit"]').click();
      await page.locator('#evidence-confirm-form').waitFor();
      await page.locator('[data-action="close-modal"]').click();
      const before = await stored(page);
      const notice = before.demo.notices.find((item) => item.id === id);
      assert.equal(notice.evidenceDocuments.length, 2);
      const selectedId = notice.evidenceDocuments.find(
        (doc) => doc.id === `${id}-paystub`,
      ).attachmentId;
      await page.locator('[data-action="packet"]').click();
      assert.equal(
        await page.locator('#appointment-packet-form [name="notice"]:checked').count(),
        0,
      );
      assert.equal(
        await page.locator('#appointment-packet-form [name="attachment"]:checked').count(),
        0,
      );
      assert.equal(
        await page.locator('#appointment-packet-form [name="history"]').isChecked(),
        false,
      );
      await page.locator(`#appointment-packet-form [name="notice"][value="${id}"]`).check();
      await page
        .locator(`#appointment-packet-form [name="attachment"][value="${selectedId}"]`)
        .check();
      await page
        .locator('#packet-questions')
        .fill('FICTIONAL_QUESTION_4831: Which reporting month applies?');
      assert.match(
        await page.locator('#packet-selection-preview').innerText(),
        /1 notice summaries.*1 supporting files/,
      );
      const pending = page.waitForEvent('download');
      await page.locator('#appointment-packet-form button[type="submit"]').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), 'anchor-appointment-packet.pdf');
      const pdf = await PDFDocument.load(await readFile(await download.path()));
      const text = packetText(pdf);
      assert.match(text, /FICTIONAL_QUESTION_4831/);
      assert.match(text, /Reporting month: August 2026/);
      assert.match(text, /Pay stubs for September 2026/);
      assert.doesNotMatch(text, /EXCLUDED_FILE_CONTENT_9283|fictional-excluded-proof/);
      const otherNotice = before.demo.notices.find((item) => item.id !== id);
      assert.ok(otherNotice);
      assert.equal(
        text.includes(otherNotice.title),
        false,
        'unselected notice summary is excluded',
      );
      assert.equal(
        pdf.getForm().getFields().length,
        0,
        'the packet is a printable handoff, with editable official forms separate',
      );
      assert.equal(pdf.getAuthor(), 'Anchor');
      const after = await stored(page);
      assert.deepEqual(after.demo.events, before.demo.events);
      assert.deepEqual(
        after.demo.notices,
        before.demo.notices,
        'downloading does not change preparation or submission status',
      );
      assert.equal(after.personal.notices.length, 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  'upgrade: native Escape during supporting-proof inference cancels saving and cannot reopen a confirmation dialog',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    let gate;
    try {
      const { page, errors } = await newPage(browser, 'readiness');
      const before = await stored(page);
      gate = await pauseRequest(page, '**/models/document-classifier.v1.json');
      await page.locator('[data-action="evidence-add"]').click();
      await page.locator('#evidence-file').setInputFiles({
        name: 'fictional-cancelled-proof.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'FICTIONAL QA ONLY\nPaystub\nEmployee: FICTIONAL RESIDENT\nReporting month: September 2026\nGross income: $1,200.00',
        ),
      });
      // Keep a DOM reference so the assertion waits for the cancelled operation's
      // finally block, even after the native dialog has closed.
      await page.locator('#evidence-add-form button[type="submit"]').evaluate((button) => {
        window.__anchorCancelledProofButton = button;
      });
      await page.locator('#evidence-add-form button[type="submit"]').click();
      await gate.started;
      await page.keyboard.press('Escape');
      await page.locator('dialog[open]').waitFor({ state: 'hidden' });
      gate.release();
      await page.waitForFunction(() => !window.__anchorCancelledProofButton.disabled);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      assert.equal(await page.locator('#evidence-confirm-form').count(), 0);
      const after = await stored(page);
      assert.deepEqual(
        after.demo.notices,
        before.demo.notices,
        'cancelled evidence is not persisted in Practice',
      );
      assert.deepEqual(
        after.personal.notices,
        before.personal.notices,
        'cancelled evidence cannot enter the personal workspace',
      );
      assert.deepEqual(after.demo.events, before.demo.events);
      assert.deepEqual(errors, []);
    } finally {
      gate?.release();
      await browser.close();
    }
  },
);

test(
  'upgrade: native Escape during packet module loading cancels the export without a late download',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    let gate;
    try {
      const { page, errors } = await newPage(browser, 'readiness');
      const before = await stored(page);
      const downloads = [];
      page.on('download', (download) => downloads.push(download.suggestedFilename()));
      gate = await pauseRequest(page, '**/appointment-packet.js');
      await page.locator('[data-action="packet"]').click();
      await page.locator('#appointment-packet-form [name="notice"]').first().check();
      await page.locator('#appointment-packet-form button[type="submit"]').evaluate((button) => {
        window.__anchorCancelledPacketButton = button;
      });
      await page.locator('#appointment-packet-form button[type="submit"]').click();
      await gate.started;
      await page.keyboard.press('Escape');
      await page.locator('dialog[open]').waitFor({ state: 'hidden' });
      gate.release();
      await page.waitForFunction(() => !window.__anchorCancelledPacketButton.disabled);
      // Let any native download notification cross the browser protocol after
      // the completed operation; this wait does not substitute for completion.
      await page.waitForTimeout(100);
      assert.deepEqual(downloads, []);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      const after = await stored(page);
      assert.deepEqual(after.demo.notices, before.demo.notices);
      assert.deepEqual(after.demo.events, before.demo.events);
      assert.deepEqual(errors, []);
    } finally {
      gate?.release();
      await browser.close();
    }
  },
);

test(
  'upgrade: changing to My workspace while the fictional demo model loads cancels the practice import and navigation',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const browser = await openBrowser();
    let gate;
    try {
      const { page, errors } = await newPage(browser);
      await page.locator('[data-action="workspace-personal"]').click();
      await navigate(page, 'evaluation');
      const before = await stored(page);
      assert.equal(before.mode, 'personal');
      gate = await pauseRequest(page, '**/models/document-classifier.v1.json');
      await page.locator('[data-action="readiness-demo"]').click();
      await gate.started;
      await page.locator('[data-action="workspace-personal"]').click();
      await page.waitForURL('**/#overview');
      const response = page.waitForResponse('**/models/document-classifier.v1.json');
      gate.release();
      await (await response).finished();
      // The model's JSON/inference continuation follows response completion;
      // allow that continuation to run before checking the cancelled import.
      await page.waitForTimeout(100);
      const after = await stored(page);
      assert.equal(after.mode, 'personal');
      assert.deepEqual(
        after.personal.notices,
        before.personal.notices,
        'a delayed fictional case cannot enter personal records',
      );
      assert.deepEqual(
        after.demo.notices,
        before.demo.notices,
        'switching ownership cancels the in-flight practice case',
      );
      assert.deepEqual(after.personal.events, before.personal.events);
      assert.equal(
        new URL(page.url()).hash,
        '#overview',
        'the delayed operation cannot reopen Check packet',
      );
      assert.equal(await page.locator('.readiness-layout').count(), 0);
      assert.equal(await page.locator('dialog[open]').count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      gate?.release();
      await browser.close();
    }
  },
);
