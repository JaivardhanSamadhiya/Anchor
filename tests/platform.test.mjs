import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFile, buildHandoff, buildBackup, escapeHTML, MAX_FILE_BYTES, loadState } from '../web/platform.js';

test('text import preserves notice content while excluding invisible controls and reports completion', async () => {
  const file = new File(['CalFresh\r\nSubmit by October 22, 2026.\u0000'], 'notice.txt', { type: 'text/plain' });
  const updates = [];
  const result = await extractFile(file, (update) => updates.push(update));
  assert.deepEqual(result, { text: 'CalFresh\nSubmit by October 22, 2026.', kind: 'text', pages: 1, ocr: false });
  assert.equal(updates.at(-1).progress, 1);
  assert.ok(updates.every(update => update.progress >= 0 && update.progress <= 1));
});

test('empty, oversized and unsupported files fail before loading document engines', async () => {
  await assert.rejects(extractFile(new File([], 'empty.txt')), /empty/);
  const tooLarge = { size: MAX_FILE_BYTES + 1, name: 'huge.pdf', type: 'application/pdf', arrayBuffer: async () => { throw new Error('must not read'); } };
  await assert.rejects(extractFile(tooLarge), /20 MB/);
  await assert.rejects(extractFile(new File(['x'], 'notice.html', { type: 'text/html' })), /Choose a PDF/);
  await assert.rejects(extractFile(new File(['x'], 'phone.heic', { type: 'image/heic' })), /HEIC/);
});

test('an overlong text notice is rejected instead of silently truncating evidence', async () => {
  const file = new File(['x'.repeat(500_001)], 'long.txt', { type: 'text/plain' });
  await assert.rejects(extractFile(file), /too long/);
});

test('an exception in progress UI does not corrupt an otherwise valid import', async () => {
  const result = await extractFile(new File(['Notice'], 'notice.txt'), () => { throw new Error('UI unavailable'); });
  assert.equal(result.text, 'Notice');
});

test('handoff keeps unconfirmed dates visibly distinct from resident-confirmed dates and includes exact source', () => {
  const handoff = buildHandoff([{
    id: 'notice-a', title: 'CalFresh renewal', program: 'CalFresh', noticeDate: '2026-10-09', sourceText: 'Original notice',
    deadlines: [
      { label: 'Submit requested items', date: '2026-10-22', confirmed: false, quote: 'Submit your form by October 22, 2026.' },
      { label: 'Interview date', date: '2026-10-20', confirmed: true, quote: 'Interview October 20, 2026.' },
    ],
    requests: [{ title: 'Pay stubs', quote: '[X] Pay stubs for September 2026' }],
  }], [{ date: '2026-10-10', type: 'Upload recorded', noticeId: 'notice-a', notes: 'Resident entered this activity.', receiptName: 'receipt.pdf' }], 'Santa Clara');
  assert.match(handoff, /2026-10-22 — Unconfirmed: needs review/);
  assert.match(handoff, /2026-10-20 — Resident confirmed/);
  assert.match(handoff, /Source: \[X\] Pay stubs for September 2026/);
  assert.match(handoff, /Receipt filename: receipt.pdf/);
  assert.match(handoff, /does not verify eligibility, receipt, approval, or legal deadlines/);
});

test('Spanish handoff retains safety labels and source text rather than claiming translation of evidence', () => {
  const handoff = buildHandoff([{ sourceText: 'Original English notice', deadlines: [{ raw: 'within 10 days', confirmed: false }] }], [], 'San Mateo', 'es');
  assert.match(handoff, /Sin confirmar: necesita revisión/);
  assert.match(handoff, /Original English notice/);
  assert.match(handoff, /Anchor no confirma elegibilidad/);
});

test('handoff retains the actual app submission details, receipt filename, and resident preparation state', () => {
  const handoff = buildHandoff([{
    id: 'actual-app-notice', title: 'Verification request', sourceText: 'Original verification notice',
    requests: [
      { title: 'September pay stubs', quote: '[X] September pay stubs', status: 'done' },
      { title: 'Renewal form', quote: '[X] Renewal form', status: 'todo' },
    ],
  }], [{
    id: 'submission-1', kind: 'submitted', title: 'Submission recorded via BenefitsCal',
    noticeId: 'actual-app-notice', detail: 'September pay stubs. Reference: FICTIONAL-123.',
    date: '2026-10-12T12:00:00', attachmentId: 'receipt-1', filename: 'fictional-confirmation.txt',
  }], 'Santa Clara');
  assert.match(handoff, /Recorded preparation: Prepared by resident/);
  assert.match(handoff, /Recorded preparation: Not marked prepared/);
  assert.match(handoff, /Notes: September pay stubs\. Reference: FICTIONAL-123\./);
  assert.match(handoff, /Receipt filename: fictional-confirmation\.txt/);
  assert.match(handoff, /does not verify eligibility, receipt, approval, or legal deadlines/);
});

test('handoff preserves competing dates, calendar exclusions, manual corrections, and resident clarification', () => {
  const handoff = buildHandoff([{
    title: 'Competing dates', clarification: 'Fictional county clarification recorded October 10.',
    deadlines: [
      { label: 'Return items', date: '2026-10-23', excluded: true, confirmed: true, quote: 'Return by October 23, 2026.' },
      { label: 'Return items', date: '2026-10-27', confirmed: true, userEntered: true, quote: 'Return by October 26, 2026.' },
    ],
  }]);
  assert.match(handoff, /2026-10-23 — Resident marked this date as not applicable; excluded from calendar/);
  assert.match(handoff, /2026-10-27 — Resident confirmed/);
  assert.match(handoff, /Date manually corrected by resident; original quote preserved/);
  assert.match(handoff, /Source: Return by October 26, 2026\./);
  assert.match(handoff, /Resident-recorded clarification: Fictional county clarification recorded October 10\./);
});

test('backup marks attachment binaries as excluded and retains data losslessly', () => {
  const state = { notices: [{ id: 'a', sourceText: 'a\nb<unsafe>' }], events: [{ attachmentId: 'receipt-id' }] };
  const backup = JSON.parse(buildBackup(state));
  assert.deepEqual(backup.state, state);
  assert.equal(backup.metadata.attachmentsIncluded, false);
  assert.equal(backup.metadata.version, 1);
  assert.ok(!Number.isNaN(Date.parse(backup.metadata.exportedAt)));
});

test('HTML escaping covers imported markup and storage absence produces an actionable error', async () => {
  assert.equal(escapeHTML('<img src="x" onerror=\'x\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;&amp;');
  if (!globalThis.indexedDB) await assert.rejects(loadState(), /Allow site storage/);
});

// Optional real-browser integration run: set ANCHOR_BROWSER_TEST_URL and
// ANCHOR_PLAYWRIGHT_MODULE to the local server and an installed Playwright module.
// A fresh, ephemeral browser context prevents any change to resident records.
test('real browser: text PDF, image OCR, scanned PDF, page cap, and receipt persistence stay local', {
  skip: !process.env.ANCHOR_BROWSER_TEST_URL || !process.env.ANCHOR_PLAYWRIGHT_MODULE,
  timeout: 180_000,
}, async () => {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const browser = await chromium.launch({ headless: true, ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = new URL(process.env.ANCHOR_BROWSER_TEST_URL).origin;
    const external = [];
    context.on('request', request => {
      if (!/^(?:data|blob):/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url());
    });
    const violations = [];
    await page.exposeFunction('reportCSPViolation', value => violations.push(value));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      window.reportCSPViolation({ directive: event.violatedDirective, blocked: event.blockedURI });
    }));
    // Run from the application document so its meta CSP applies to imports and workers.
    await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2','dismissed'));
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
    await page.locator('[data-action="import"]').first().waitFor();
    const document = await PDFDocument.create();
    const pdfPage = document.addPage([612, 792]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    const lines = ['FICTIONAL PRACTICE NOTICE', 'CalFresh CF377.6 County of Santa Clara', 'Return requested items by October 24, 2026.'];
    lines.forEach((line, index) => pdfPage.drawText(line, { x: 60, y: 730 - index * 50, size: 16, font }));
    const textPDF = await page.evaluate(async bytes => {
      const api = await import(new URL('platform.js', location.href).href);
      const result = await api.extractFile(new File([new Uint8Array(bytes)], 'practice.pdf', { type: 'application/pdf' }));
      return { kind: result.kind, pages: result.pages, ocr: result.ocr, hasExpected: result.text.includes('October 24, 2026') };
    }, [...await document.save()]);
    assert.deepEqual(textPDF, { kind: 'pdf', pages: 1, ocr: false, hasExpected: true });

    const imageResult = await page.evaluate(async () => {
      const api = await import(new URL('platform.js', location.href).href);
      const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 650;
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 1400, 650);
      context.fillStyle = 'black'; context.font = '36px Arial';
      context.fillText('FICTIONAL PRACTICE NOTICE', 60, 100);
      context.fillText('CalFresh CF377.6 County of Santa Clara', 60, 180);
      context.fillText('Return requested items by October 24, 2026.', 60, 260);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const progress = [];
      const result = await api.extractFile(new File([blob], 'practice.png', { type: 'image/png' }), update => progress.push(update.progress));
      return { kind: result.kind, pages: result.pages, ocr: result.ocr, hasExpected: result.text.includes('October 24, 2026'), progressFinal: progress.at(-1), image: canvas.toDataURL('image/png') };
    });
    const { image, ...imageMetadata } = imageResult;
    assert.deepEqual(imageMetadata, { kind: 'image', pages: 1, ocr: true, hasExpected: true, progressFinal: 1 });

    const scanned = await PDFDocument.create();
    const embedded = await scanned.embedPng(Buffer.from(image.split(',')[1], 'base64'));
    const scannedPage = scanned.addPage([700, 325]);
    scannedPage.drawImage(embedded, { x: 0, y: 0, width: 700, height: 325 });
    const scannedResult = await page.evaluate(async bytes => {
      const api = await import(new URL('platform.js', location.href).href);
      const result = await api.extractFile(new File([new Uint8Array(bytes)], 'scan.pdf', { type: 'application/pdf' }));
      return { kind: result.kind, pages: result.pages, ocr: result.ocr, hasExpected: result.text.includes('October 24, 2026') };
    }, [...await scanned.save()]);
    assert.deepEqual(scannedResult, { kind: 'pdf', pages: 1, ocr: true, hasExpected: true });

    const mixed = await PDFDocument.create();
    const mixedImage = await mixed.embedPng(Buffer.from(image.split(',')[1], 'base64'));
    const mixedPage = mixed.addPage([700, 450]);
    const mixedFont = await mixed.embedFont(StandardFonts.Helvetica);
    mixedPage.drawText('County correspondence scanned attachment with a selectable header.', { x: 20, y: 425, size: 12, font: mixedFont });
    mixedPage.drawImage(mixedImage, { x: 0, y: 30, width: 700, height: 325 });
    const mixedResult = await page.evaluate(async bytes => {
      const api = await import(new URL('platform.js', location.href).href);
      const result = await api.extractFile(new File([new Uint8Array(bytes)], 'mixed.pdf', { type: 'application/pdf' }));
      return { ocr: result.ocr, hasExpected: result.text.includes('October 24, 2026') };
    }, [...await mixed.save()]);
    assert.deepEqual(mixedResult, { ocr: true, hasExpected: true });

    const longPDF = await PDFDocument.create();
    for (let number = 0; number < 11; number++) longPDF.addPage([612, 792]);
    const rejection = await page.evaluate(async bytes => {
      const api = await import(new URL('platform.js', location.href).href);
      try { await api.extractFile(new File([new Uint8Array(bytes)], '11-pages.pdf', { type: 'application/pdf' })); return 'unexpected success'; }
      catch (error) { return error.message; }
    }, [...await longPDF.save()]);
    assert.match(rejection, /at most 10 pages/);

    const storage = await page.evaluate(async () => {
      const api = await import(new URL('platform.js', location.href).href);
      const id = await api.saveAttachment(new File(['fictional receipt'], 'receipt.txt', { type: 'text/plain' }));
      await api.saveState({ notices: [{ id: 'platform-test' }], events: [] });
      const state = await api.loadState();
      const receipt = await api.getAttachment(id);
      const roundtrip = await receipt.blob.text();
      await api.clearState();
      return { stateOK: state.notices[0].id === 'platform-test', blobOK: roundtrip === 'fictional receipt', cleared: (await api.loadState()) === null, attachmentCleared: (await api.getAttachment(id)) === null };
    });
    assert.deepEqual(storage, { stateOK: true, blobOK: true, cleared: true, attachmentCleared: true });
    assert.deepEqual(violations, [], 'The local PDF and OCR engines must operate under the app CSP');
    assert.deepEqual(external, [], 'PDF and OCR must not load a runtime CDN or send document data off-origin');
  } finally { await browser.close(); }
});

test('real browser UI: source confirmation, receipt handoff, and prepared readers survive offline reload', {
  skip: !process.env.ANCHOR_BROWSER_TEST_URL || !process.env.ANCHOR_PLAYWRIGHT_MODULE,
  timeout: 180_000,
}, async () => {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const browser = await chromium.launch({ headless: true, ...(process.env.ANCHOR_BROWSER_EXECUTABLE ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = new URL(process.env.ANCHOR_BROWSER_TEST_URL).origin;
    const external = [], uploads = [], violations = [], pageErrors = [];
    context.on('request', request => {
      if (!/^(?:data|blob):/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) uploads.push({ method: request.method(), url: request.url() });
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.exposeFunction('reportCSPViolation', value => violations.push(value));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      window.reportCSPViolation({ directive: event.violatedDirective, blocked: event.blockedURI });
    }));
    await page.addInitScript(() => sessionStorage.setItem('anchor-guide-session-v2','dismissed'));
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
    await page.locator('[data-action="import"]').first().waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 });

    const noticeLines = [
      'FICTIONAL PRACTICE NOTICE', 'CalFresh CF377.6 County of Santa Clara',
      'Submit the requested items by October 24, 2026.', '[X] Pay stubs for September 2026',
    ];
    const pdf = await PDFDocument.create();
    const pdfPage = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    noticeLines.forEach((line, index) => pdfPage.drawText(line, { x: 40, y: 730 - index * 45, size: 14, font }));
    const pdfBytes = Buffer.from(await pdf.save());
    const photoData = await page.evaluate(lines => {
      const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 650;
      const drawing = canvas.getContext('2d'); drawing.fillStyle = 'white'; drawing.fillRect(0, 0, 1400, 650);
      drawing.fillStyle = 'black'; drawing.font = '36px Arial';
      lines.forEach((line, index) => drawing.fillText(line, 50, 100 + index * 80));
      return canvas.toDataURL('image/png');
    }, noticeLines);
    const photoBytes = Buffer.from(photoData.split(',')[1], 'base64');
    const importViaUI = async (name, mimeType, buffer) => {
      // The review page intentionally focuses on the existing notice; add another from My notices.
      await page.locator('[data-action="nav"][data-page="notices"]').first().click();
      await page.locator('[data-action="import"]').first().click();
      await page.locator('#notice-file').setInputFiles({ name, mimeType, buffer });
      await page.locator('.source-panel').waitFor({ timeout: 60_000 });
      await page.waitForFunction(() => !document.querySelector('#modal').open);
    };
    await importViaUI('fictional-platform-ui.pdf', 'application/pdf', pdfBytes);
    assert.equal(await page.locator('[data-action="workspace-personal"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.account-button').textContent(), 'Sign in');
    assert.equal(await page.locator('[data-action="confirm-plan"]').isDisabled(), true);
    await page.locator('.fact [data-action="source"]').first().click();
    assert.match(await page.locator('.source-line.highlight').textContent(), /October 24, 2026/);
    const dates = await page.locator('input[data-confirm]').count();
    assert.ok(dates > 0, 'A source-linked deadline must be offered for review');
    for (let checked = 0; checked < dates; checked++) {
      await page.locator('input[data-confirm]:not(:checked)').first().check();
      await page.waitForFunction(count => document.querySelectorAll('input[data-confirm]:checked').length === count, checked + 1);
    }
    await page.locator('[data-action="confirm-plan"]').click();
    await page.locator('[data-action="task"]').first().click();
    await page.locator('.task-check.done').waitFor();
    await page.locator('[data-action="receipt"]').first().click();
    await page.locator('#receipt-date').fill('2026-10-12');
    await page.locator('#receipt-note').fill('Fictional September pay stubs. Reference: TEST-456.');
    await page.locator('#receipt-file').setInputFiles({ name: 'fictional-ui-receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional confirmation TEST-456') });
    await page.locator('#receipt-form button[type="submit"]').click();
    await page.locator('.evidence-row').waitFor();
    const saved = await page.evaluate(async () => {
      const api = await import(new URL('platform.js', location.href).href);
      const saved = await api.loadState();
      const notice = saved.personal.notices[0];
      const record = saved.personal.events.find(event => event.kind === 'submitted');
      return { mode: saved.mode, demoCount: saved.demo.notices.length, reviewed: notice.reviewed,
        confirmed: notice.deadlines.every(date => date.confirmed), originalBytes: (await api.getAttachment(notice.originalAttachmentId)).blob.size,
        receipt: await (await api.getAttachment(record.attachmentId)).blob.text(), noticeId: notice.id };
    });
    assert.equal(saved.mode, 'personal');
    assert.equal(saved.demoCount, 2, 'Importing a real file must not mutate the fictional workspace');
    assert.equal(saved.reviewed, true);
    assert.equal(saved.confirmed, true);
    assert.equal(saved.originalBytes, pdfBytes.length);
    assert.equal(saved.receipt, 'Fictional confirmation TEST-456');
    await page.locator('[data-action="nav"][data-page="plan"]').first().click();
    await page.locator('[data-action="handoff"]').first().click();
    const handoff = await page.locator('#handoff-preview').inputValue();
    assert.match(handoff, /Recorded preparation: Prepared by resident/);
    assert.match(handoff, /Notes: Fictional September pay stubs\. Reference: TEST-456\./);
    assert.match(handoff, /Receipt filename: fictional-ui-receipt\.txt/);
    assert.match(handoff, /Resident confirmed/);
    await page.locator('[data-action="close-modal"]').first().click();

    await page.locator('[data-action="privacy"]').first().click();
    await page.locator('[data-action="prepare-offline"]').click();
    await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent.includes('ready for offline use'), undefined, { timeout: 60_000 });
    const cached = await page.evaluate(async () => {
      const manifest = await (await fetch(new URL('vendor/manifest.json', location.href))).json();
      const readers = await caches.open('anchor-readers-v1');
      const missing = [];
      for (const asset of manifest.assets) if (!(await readers.match(new URL(asset.path, location.href).href))) missing.push(asset.path);
      return { total: manifest.assets.length, missing, shell: !!(await caches.match(new URL('index.html', location.href).href)) };
    });
    assert.ok(cached.total > 10);
    assert.deepEqual(cached.missing, []);
    assert.equal(cached.shell, true);
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-action="import"]').first().waitFor();
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    const persisted = await page.evaluate(async id => {
      const api = await import(new URL('platform.js', location.href).href);
      const saved = await api.loadState();
      return { notice: saved.personal.notices.some(notice => notice.id === id && notice.reviewed), receiptCount: saved.personal.events.filter(event => event.kind === 'submitted').length };
    }, saved.noticeId);
    assert.deepEqual(persisted, { notice: true, receiptCount: 1 });
    await importViaUI('fictional-offline.pdf', 'application/pdf', pdfBytes);
    await importViaUI('fictional-offline-photo.png', 'image/png', photoBytes);
    const offlineImports = await page.evaluate(async () => {
      const api = await import(new URL('platform.js', location.href).href);
      const saved = await api.loadState();
      return saved.personal.notices.slice(0, 2).map(notice => ({ filename: notice.filename, kind: notice.importKind,
        ocr: notice.ocr, hasDate: notice.sourceText.includes('October 24, 2026'), originalSaved: !!notice.originalAttachmentId,
        datesUnconfirmed: notice.deadlines.every(date => !date.confirmed) }));
    });
    assert.deepEqual(offlineImports, [
      { filename: 'fictional-offline-photo.png', kind: 'image', ocr: true, hasDate: true, originalSaved: true, datesUnconfirmed: true },
      { filename: 'fictional-offline.pdf', kind: 'pdf', ocr: false, hasDate: true, originalSaved: true, datesUnconfirmed: true },
    ]);
    assert.deepEqual(external, [], 'No off-origin document or dependency traffic is permitted');
    assert.deepEqual(uploads, [], 'File import must not upload document data');
    assert.deepEqual(violations, []);
    assert.deepEqual(pageErrors, []);
  } finally { await browser.close(); }
});
