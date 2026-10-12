import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { PDFArray, PDFDict, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';

async function source(entry) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
const { buildAppointmentPacket } = await source('src/infrastructure/appointment-packet.ts');
const { createAppointmentPacketInput, validateAppointmentPacketInput } = await source('src/domain/appointment-packet.ts');

function input(updates = {}) {
  return {
    language: 'en', createdAt: '2026-10-12T12:00:00Z', residentName: 'Fictional Resident',
    notices: [{ id: 'notice1', title: 'Fictional CalFresh renewal', program: 'CalFresh', county: 'Santa Clara', reviewed: true,
      deadlines: [{ id: 'd1', label: 'Return date', date: '2026-10-30', confirmed: true }],
      requests: [{ id: 'r1', title: 'September income proof', kind: 'income', status: 'todo', quote: 'Please return income proof for September.', line: 7 }] }],
    questions: ['May I use an employer letter instead?'], submissions: [], selectedAttachmentIds: [], includeSubmissionHistory: false,
    ...updates,
  };
}
function pageText(document, page) {
  const references = page.node.Contents();
  const streams = references instanceof PDFArray ? references.asArray().map((ref) => document.context.lookup(ref)) : [references];
  const decoder = new TextDecoder('windows-1252');
  return streams.filter(Boolean).flatMap((stream) => {
    const content = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    return [...content.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map((match) => decoder.decode(Buffer.from(match[1], 'hex')));
  }).join('\n');
}
function packetText(document) { return document.getPages().map((page) => pageText(document, page)).join('\n'); }
async function supportPdf(text = 'SELECTED_SUPPORT_DOCUMENT', pageCount = 1) {
  const document = await PDFDocument.create();
  document.setAuthor('PRIVATE_ORIGINAL_METADATA');
  for (let number = 0; number < pageCount; number++) document.addPage().drawText(`${text} ${number + 1}`, { x: 30, y: 600 });
  return document.save();
}

test('a selected snapshot produces a numbered source-linked packet with neutral metadata', async () => {
  const document = await PDFDocument.load(await buildAppointmentPacket(input()));
  const text = packetText(document);
  assert.match(text, /Ready for your appointment/);
  assert.match(text, /Contents/);
  assert.match(text, /Original wording \(line 7\)/);
  assert.match(text, /September income proof/);
  assert.match(text, /2026-10-30 - confirmed by you/);
  assert.match(text, /May I use an employer letter instead\?/);
  assert.match(text, /does not submit it/);
  assert.equal(document.getTitle(), 'Anchor appointment packet');
  assert.equal(document.getAuthor(), 'Anchor');
  assert.equal(document.getCreator(), 'Anchor local PDF tools');
  assert.equal(document.getForm().getFields().length, 0);
  for (const page of document.getPages()) assert.match(pageText(document, page), /Prepared by you - not submitted by Anchor/);
  assert.equal(pageText(document, document.getPages()[1]).includes('Selected notices and requests\n3'), true);
});

test('only explicit attachment choices and permitted submission records enter the packet', async () => {
  const selected = await supportPdf();
  const untouched = selected.slice();
  const excluded = new TextEncoder().encode('PRIVATE_EXCLUDED_FILE');
  const document = await PDFDocument.load(await buildAppointmentPacket(input({
    selectedAttachmentIds: ['chosen'],
    submissions: [{ id: 'private-record', date: '2026-10-11', detail: 'PRIVATE_EXCLUDED_SUBMISSION' }],
  }), [
    { id: 'chosen', name: 'Selected proof.pdf', mimeType: 'application/pdf', bytes: selected },
    { id: 'excluded', name: 'Excluded file.txt', mimeType: 'text/plain', bytes: excluded },
  ]));
  const text = packetText(document);
  assert.match(text, /SELECTED_SUPPORT_DOCUMENT/);
  assert.match(text, /Selected proof.pdf/);
  assert.doesNotMatch(text, /PRIVATE_EXCLUDED_FILE|PRIVATE_EXCLUDED_SUBMISSION|Excluded file.txt/);
  assert.notEqual(document.getAuthor(), 'PRIVATE_ORIGINAL_METADATA');
  assert.deepEqual(selected, untouched, 'input file bytes are not changed');
  const original = await PDFDocument.load(selected);
  assert.equal(original.getAuthor(), 'PRIVATE_ORIGINAL_METADATA');
});

test('official interactive forms are listed separately and an unmarked interactive attachment is rejected', async () => {
  const official = await readFile('web/forms/cf37.pdf');
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ selectedAttachmentIds: ['form'] }), [
    { id: 'form', name: 'CF 37 editable unsigned form.pdf', mimeType: 'application/pdf', role: 'official-form', bytes: official },
  ]));
  assert.match(packetText(document), /Separate editable download/);
  assert.equal(document.getForm().getFields().length, 0);
  assert.ok(document.getPageCount() < 11, 'official form pages were not copied without their fields');
  await assert.rejects(buildAppointmentPacket(input({ selectedAttachmentIds: ['form'] }), [
    { id: 'form', name: 'CF 37.pdf', mimeType: 'application/pdf', bytes: official },
  ]), /editable or signed forms.*separate/);
});

test('Spanish accents, literal quotes, unbroken references and long paragraphs wrap over multiple readable pages', async () => {
  const paragraph = '¿Qué documentación necesito para la renovación? José Álvarez revisó el comprobante de septiembre. La señora Núñez pidió una explicación clara de los ingresos y la fecha. ';
  const questions = [paragraph.repeat(20), 'Referencia: ' + 'ABC123'.repeat(100), 'El aviso dice: "entregue la documentación". ¿Puedo usar otra prueba?'];
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ language: 'es', questions })));
  const text = packetText(document);
  assert.ok(document.getPageCount() >= 4);
  assert.match(text, /Todo listo para tu cita/);
  assert.match(text, /José Álvarez/);
  assert.match(text, /señora Núñez/);
  assert.match(text, /"entregue la documentación"/);
  assert.equal((text.replace(/\s+/g, ' ').match(/¿Qué documentación/g) ?? []).length, 20);
  assert.match(text, /Anchor no lo ha enviado/);
  for (const page of document.getPages()) {
    const contents = page.node.Contents();
    for (const reference of contents instanceof PDFArray ? contents.asArray() : [contents]) {
      const stream = document.context.lookup(reference);
      const raw = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      for (const match of raw.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
        assert.ok(Number(match[1]) >= 48 && Number(match[1]) <= 564, 'text starts within horizontal margins');
        assert.ok(Number(match[2]) >= 30 && Number(match[2]) <= 754, 'text stays within page bounds');
      }
    }
  }
});

test('UTF-8 text appendices paginate safely and preserve literal document text', async () => {
  const content = ('Comprobante ficticio: "septiembre"; ingreso: $123.50; dirección: Calle Peña.\n').repeat(90);
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ selectedAttachmentIds: ['text'] }), [
    { id: 'text', name: 'Comprobante.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(content) },
  ]));
  const text = packetText(document);
  assert.equal((text.match(/Comprobante ficticio/g) ?? []).length, 90);
  assert.match(text, /Calle Peña/);
  assert.ok(document.getPageCount() >= 5);
});

test('submission history preserves agency acceptance boundaries and explains excluded receipt files', async () => {
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ includeSubmissionHistory: true,
    submissions: [{ id: 'event1', date: '2026-10-11T12:00:00Z', title: 'BenefitsCal upload', detail: 'Fictional confirmation ABC-001', attachmentId: 'receipt' }],
  })));
  const text = packetText(document);
  assert.match(text, /Fictional confirmation ABC-001/);
  assert.match(text, /has not independently verified receipt or acceptance/);
  assert.match(text, /associated file was not selected/);
});

test('the workspace adapter selects notices, isolates event kinds and does not mutate saved facts', () => {
  const notice = input().notices[0];
  const workspace = { notices: [{ ...notice, supported: true }, { ...notice, id: 'notice2', title: 'OTHER_PRIVATE_NOTICE', supported: true }],
    events: [{ id: 's1', noticeId: 'notice1', kind: 'submitted', date: '2026-10-11', detail: 'Chosen submission' },
      { id: 's2', noticeId: 'notice2', kind: 'submitted', date: '2026-10-11', detail: 'Unselected submission' },
      { id: 'p1', noticeId: 'notice1', kind: 'prepared', date: '2026-10-11', detail: 'Preparation is not submission' }] };
  const original = structuredClone(workspace);
  const selected = createAppointmentPacketInput(workspace, { createdAt: '2026-10-12', noticeIds: ['notice1'], includeSubmissionHistory: true });
  assert.deepEqual(selected.notices.map((item) => item.id), ['notice1']);
  assert.deepEqual(selected.submissions.map((item) => item.id), ['s1']);
  assert.deepEqual(selected.selectedAttachmentIds, []);
  selected.notices[0].requests[0].title = 'changed';
  assert.deepEqual(workspace, original);
  const defaultPacket = createAppointmentPacketInput(workspace, { createdAt: '2026-10-12', noticeIds: [] });
  assert.deepEqual(defaultPacket.submissions, []);
  assert.deepEqual(defaultPacket.notices, []);
  assert.throws(() => createAppointmentPacketInput(workspace, { createdAt: '2026-10-12', noticeIds: ['missing'] }), /unavailable/);
});

test('selected missing, duplicated, malformed, encrypted and excessive attachments produce actionable errors', async () => {
  const chosen = input({ selectedAttachmentIds: ['file'] });
  await assert.rejects(buildAppointmentPacket(chosen), /unavailable or duplicated/);
  const file = { id: 'file', name: 'Bad.pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('not a PDF') };
  await assert.rejects(buildAppointmentPacket(chosen, [file, file]), /duplicated/);
  await assert.rejects(buildAppointmentPacket(chosen, [file]), /cannot be read or is encrypted/);
  await assert.rejects(buildAppointmentPacket(chosen, [{ ...file, bytes: await readFile('web/forms/sar7b.pdf') }]), /encrypted/);
  await assert.rejects(buildAppointmentPacket(chosen, [{ ...file, bytes: new Uint8Array(20 * 1024 * 1024 + 1) }]), /larger than 20 MB/);
  await assert.rejects(buildAppointmentPacket(chosen, [{ ...file, bytes: await supportPdf('Fictional page', 61) }]), /1 to 60 pages/);
  await assert.rejects(buildAppointmentPacket(input({ selectedAttachmentIds: ['a', 'b'] }), [
    { ...file, id: 'a', bytes: await supportPdf('Fictional page', 60) },
    { ...file, id: 'b', bytes: await supportPdf('Fictional page', 40) },
  ]), /exceed 100 pages/);
  await assert.rejects(buildAppointmentPacket(chosen, [{ ...file, mimeType: 'text/plain', bytes: new Uint8Array([255, 254]) }]), /UTF-8/);
  await assert.rejects(buildAppointmentPacket(chosen, [{ ...file, mimeType: 'text/plain', bytes: new TextEncoder().encode('a'.repeat(40_001)) }]), /40,000/);
});

test('printable copies retain every source page while removing executable annotations', async () => {
  const original = await PDFDocument.create();
  const page = original.addPage();
  page.drawText('PRINTABLE_CONTENT_RETAINED', { x: 30, y: 600 });
  page.node.set(PDFName.of('AA'), original.context.obj({ O: { S: 'JavaScript', JS: 'PRIVATE_EXECUTABLE_SOURCE' } }));
  page.node.set(PDFName.of('Annots'), original.context.obj([{ Type: 'Annot', Subtype: 'Link', Rect: [20, 20, 50, 50], A: { S: 'URI', URI: 'https://example.com/private' } }]));
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ selectedAttachmentIds: ['safe'] }), [
    { id: 'safe', name: 'Support.pdf', mimeType: 'application/pdf', bytes: await original.save() },
  ]));
  const appended = document.getPages().find((item) => pageText(document, item).includes('PRINTABLE_CONTENT_RETAINED'));
  assert.ok(appended);
  assert.equal(appended.node.has(PDFName.of('AA')), false);
  assert.equal(appended.node.has(PDFName.of('Annots')), false);
  assert.equal(original.getPages()[0].node.has(PDFName.of('AA')), true, 'original remains untouched');
});

test('oversized selections, invalid snapshots and unsupported characters fail without silent truncation', async () => {
  assert.throws(() => validateAppointmentPacketInput(input({ selectedAttachmentIds: ['same', 'same'] })), /unique selected IDs/);
  assert.throws(() => validateAppointmentPacketInput(input({ questions: ['q'.repeat(4001)] })), /4000/);
  assert.throws(() => validateAppointmentPacketInput(input({ language: 'fr' })), /English or Spanish/);
  assert.throws(() => validateAppointmentPacketInput(input({ createdAt: 'not-a-date' })), /valid packet creation date/);
  assert.throws(() => validateAppointmentPacketInput(input({ createdAt: '2026-02-30T12:00:00Z' })), /valid packet creation date/);
  await assert.rejects(buildAppointmentPacket(input({ questions: ['名字'] })), /font cannot display/);
});

test('a long contents list uses multiple pages with correct destination numbers', async () => {
  const notices = Array.from({ length: 30 }, (_, index) => ({ id: `notice-${index}`, title: `Fictional notice ${index + 1}: ` + 'Long descriptive title for an appointment with the county. '.repeat(4), reviewed: true, requests: [], deadlines: [] }));
  const document = await PDFDocument.load(await buildAppointmentPacket(input({ notices })));
  const pages = document.getPages();
  const continued = pages.filter((page) => /Contents continued/.test(pageText(document, page)));
  assert.ok(continued.length > 0);
  const firstSection = pages.findIndex((page) => /No definite requests were recorded/.test(pageText(document, page)));
  assert.ok(firstSection > 2, 'multiple contents pages precede the notice sections');
  assert.match(pageText(document, pages[1]), new RegExp(`Selected notices and requests\\n${firstSection + 1}`));
  assert.equal((packetText(document).match(/No definite requests were recorded/g) ?? []).length, 30);
});
