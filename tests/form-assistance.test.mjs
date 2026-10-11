import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';
import { analyzeNotice } from '../web/engine.js';
import { DEMO_NOTICES } from '../web/data.js';

async function loadSource(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const domain = await loadSource('src/domain/form-assistance.ts');
const { renderFormAssistance } = await loadSource('src/ui/form-assistance-view.ts');
const { getFormAssistance, createFormDraft, updateFormDraft, toPdfFieldValues, formDraftSummary, assessFormDraft, visibleFormFields } = domain;

function notice(overrides = {}) {
  return {
    id: 'case-a', title: 'CalFresh request', supported: true, program: 'CalFresh', type: 'verification',
    sourceText: 'CalFresh\nPlease complete the CF 37 form.', deadlines: [],
    requests: [{ id: 'request-a', kind: 'form', title: 'Complete CF 37', quote: 'Please complete the CF 37 form.', status: 'todo' }],
    ...overrides,
  };
}

test('the actual renewal sample opens source-backed CF37 assistance without changing its facts', () => {
  const sample = DEMO_NOTICES.find((item) => item.id === 'renewal');
  const input = analyzeNotice(sample.text, { id: sample.id });
  const before = structuredClone(input);
  const result = getFormAssistance(input);
  assert.deepEqual(input, before);
  assert.equal(result.form.id, 'cf37');
  assert.equal(result.form.pages, 11);
  assert.equal(result.sections[0].page, 8, 'seven program-rule pages precede the application');
  assert.match(result.rationale, /confirm your county/i);
  assert.ok(result.checklist.some((item) => /interview/i.test(item.title)));
  assert.ok(result.sections.length >= 7);
});

test('explicit selected request codes choose the correct form; conflicts and unknown requests never guess', () => {
  const sar = notice({ sourceText: 'CalFresh CF 37 and SAR 7', requests: [{ id: 'sar', kind: 'form', title: 'Complete SAR 7', quote: 'Return SAR 7', status: 'todo' }] });
  assert.equal(getFormAssistance(sar, 'sar').form.id, 'sar7b');
  const conflict = notice({ sourceText: 'CalFresh CF 37 and SAR 7', requests: [{ id: 'form', kind: 'form', title: 'Return your forms', status: 'todo' }] });
  assert.equal(getFormAssistance(conflict).kind, 'request-guide');
  assert.equal(getFormAssistance(notice({ supported: false })).form, null);
  assert.equal(getFormAssistance(notice({ program: 'Housing', sourceText: 'Housing renewal', type: 'renewal' })).form, null);
  assert.equal(getFormAssistance(notice({ requests: [{ id: 'income', kind: 'income', title: 'Pay stubs', status: 'todo' }] })).form, null);
  assert.equal(getFormAssistance(notice(), 'missing').form, null);
  const unknown = getFormAssistance(notice({ supported: false }));
  assert.equal(unknown.sections.length, 3);
  assert.match(unknown.sections[1].description, /actual form/);
});

test('draft validation limits fields, rejects invalid money and preserves no inferred answers', () => {
  const assist = getFormAssistance(notice());
  const blank = createFormDraft(assist, '2026-10-10T10:00:00Z');
  const before = structuredClone(blank);
  const draft = updateFormDraft(assist, blank, { caseName: 'A'.repeat(500), q1: 'no', q2: 'maybe', rent: '-100', originalReviewed: true, hiddenUnknown: 'secret', signature: 'forged' }, '2026-10-10T11:00:00Z');
  assert.deepEqual(blank, before);
  assert.equal(draft.answers.caseName.length, 120);
  assert.equal(draft.answers.q1, 'no');
  assert.equal(draft.answers.q2, undefined);
  assert.equal(draft.answers.rent, undefined);
  assert.equal(draft.answers.hiddenUnknown, undefined);
  assert.equal(draft.answers.signature, undefined);
  assert.equal(draft.updatedAt, '2026-10-10T11:00:00Z');
  assert.deepEqual(assessFormDraft(assist, draft), { answered: 2, questions: 34, needsHelp: 0, signed: false, submitted: false, status: 'draft' });
});

test('conditional details are retained as notes but excluded from PDF and summary when no longer applicable', () => {
  const assist = getFormAssistance(notice());
  let draft = updateFormDraft(assist, createFormDraft(assist), { q3: 'yes', newAddress: '15 Practice Way' });
  assert.ok(toPdfFieldValues(assist, draft).some((field) => field.name === 'question3-1-1'));
  draft = updateFormDraft(assist, draft, { q3: 'no' });
  assert.equal(draft.answers.newAddress, '15 Practice Way', 'changing a conditional answer does not destroy preparation notes');
  assert.ok(!visibleFormFields(assist.sections[1], draft).some((field) => field.id === 'newAddress'));
  assert.ok(!toPdfFieldValues(assist, draft).some((field) => field.name === 'question3-1-1'));
  assert.doesNotMatch(formDraftSummary(assist, draft), /15 Practice Way/);
  assert.deepEqual(toPdfFieldValues(assist, draft).filter((field) => /question3-[12]$/.test(field.name)).map((field) => field.value), [false, true]);
});

test('drafts from another case cannot bleed through stale modal or account state', () => {
  const a = getFormAssistance(notice());
  const b = getFormAssistance(notice({ id: 'case-b' }));
  const draft = updateFormDraft(a, createFormDraft(a), { caseName: 'Private A' });
  assert.deepEqual(updateFormDraft(b, draft, {}).answers, {});
  assert.equal(toPdfFieldValues(b, draft).length, 0);
});

test('all mapped field names and types exist in the actual official PDF; export remains unsigned', async () => {
  const assist = getFormAssistance(notice());
  const bytes = await readFile('web/forms/cf37.pdf');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), assist.form.pages);
  const form = pdf.getForm();
  const updates = {};
  for (const section of assist.sections) {
    for (const field of section.fields) {
      updates[field.id] = field.kind === 'checkbox' ? true : field.kind === 'choice' ? 'yes' : field.kind === 'money' ? '1200.50' : 'Fictional draft';
      for (const name of field.pdfText ?? []) assert.equal(form.getTextField(name).constructor.name, 'PDFTextField');
      for (const name of Object.values(field.pdfChecks ?? {}).flat()) assert.equal(form.getCheckBox(name).constructor.name, 'PDFCheckBox');
    }
  }
  const draft = updateFormDraft(assist, createFormDraft(assist), updates);
  const mapped = toPdfFieldValues(assist, draft);
  for (const field of mapped) {
    if (field.type === 'text') form.getTextField(field.name).setText(field.value);
    else if (field.value) form.getCheckBox(field.name).check();
    else form.getCheckBox(field.name).uncheck();
  }
  const exported = await PDFDocument.load(await pdf.save());
  assert.equal(exported.getForm().getTextField('case_name').getText(), 'Fictional draft');
  assert.equal(exported.getForm().getTextField('case_name_header').getText(), 'Fictional draft');
  assert.equal(exported.getForm().getCheckBox('question1-1').isChecked(), true);
  assert.ok(!mapped.some((field) => /signed_date|signature/i.test(field.name)));
  assert.equal(exported.getForm().getTextField('signed_date').getText(), undefined);
  assert.equal(assessFormDraft(assist, draft).signed, false);
  assert.match(formDraftSummary(assist, draft), /DRAFT \/ UNSIGNED \/ NOT SUBMITTED/);
});

test('SAR7B fills verified official fields and retains earlier freeform drafts for explicit transfer', () => {
  const assist = getFormAssistance(notice({ sourceText: 'CalFresh SAR 7', requests: [{ id: 'sar', kind: 'form', title: 'Complete SAR 7', status: 'todo' }] }));
  const draft = updateFormDraft(assist, createFormDraft(assist), { reportMonth: 'September 2026', incomeDetails: 'Fictional job example' });
  assert.equal(assist.form.fillable, true);
  assert.ok(toPdfFieldValues(assist, draft).some((field) => field.name === 'SAR7  10' && field.value === 'September 2026'));
  assert.deepEqual(draft.legacyNotes, { incomeDetails: 'Fictional job example' });
  assert.match(formDraftSummary(assist, draft), /September 2026/);
  assert.match(formDraftSummary(assist, draft), /Earlier saved preparation notes/);
  assert.match(renderFormAssistance({ assistance: assist, draft }), /data-action="form-export-pdf"/);
});

test('earlier CF37 table notes survive schema upgrades without guessed table cell mappings', () => {
  const assist = getFormAssistance(notice());
  const saved = { ...createFormDraft(assist), answers: { caseName: 'Resident', jobDetails: 'Old employer and dates', householdDetails: 'Older household table' } };
  const upgraded = updateFormDraft(assist, saved, { caseName: 'Updated' });
  assert.deepEqual(upgraded.legacyNotes, { householdDetails: 'Older household table', jobDetails: 'Old employer and dates' });
  assert.deepEqual(domain.legacyFormNotes(upgraded).map((item) => item.value), ['Older household table', 'Old employer and dates']);
  assert.equal(toPdfFieldValues(assist, upgraded).find((item) => item.name === 'case_name').value, 'Updated');
  assert.ok(!toPdfFieldValues(assist, upgraded).some((item) => String(item.value).includes('Old employer')));
  assert.deepEqual(updateFormDraft(assist, upgraded, {}).legacyNotes, upgraded.legacyNotes);
});

test('structured table answers target verified cells and page locations', () => {
  const assist = getFormAssistance(notice());
  const draft = updateFormDraft(assist, createFormDraft(assist), { q1: 'yes', member1Name: 'Ada Example', member1Change: 'in', member1MoveDate: '101026', q7: 'yes', job3Name: 'Ben Example', job3Frequency: 'monthly', job3Gross: '2500', q9: 'yes', medicalName: 'Ada Example', medicalAmount: '80', q13: 'yes', q13Who: 'Ben Example' });
  const values = toPdfFieldValues(assist, draft);
  assert.ok(values.some((item) => item.name === 'question1-1-3' && item.value === 'Ada Example'));
  assert.ok(values.some((item) => item.name === 'question7-1-18-3' && item.value === true));
  assert.ok(values.some((item) => item.name === 'question9-1-3' && item.value === '80'));
  assert.equal(domain.officialFormFields('cf37').find((item) => item.id === 'q5').page, 9);
  assert.equal(domain.officialFormFields('cf37').find((item) => item.id === 'additionalNotes').page, 7);
  assert.ok(assist.sections.flatMap((section) => section.fields).filter((field) => field.kind !== 'checkbox').every((field) => field.pdfText || field.pdfChecks), 'guided form answers all have verified PDF mappings');
});

test('public source assets match their checked registry and remain same-origin', async () => {
  const registry = JSON.parse(await readFile('web/forms/sources.json', 'utf8'));
  for (const asset of registry.assets) {
    const bytes = await readFile(`web/forms/${asset.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    assert.equal(new URL(asset.source).hostname, 'www.cdss.ca.gov');
  }
  assert.ok(domain.OFFICIAL_FORMS.every((form) => form.localPath.startsWith('./forms/')));
});

test('renderer escapes private text and exposes accessible in-platform controls without remote frames', () => {
  const assist = getFormAssistance(notice({ id: 'x" onmouseover="bad', supported: false, requests: [{ id: 'r', kind: 'form', title: '<script>bad()</script>', quote: '<img src=x onerror=bad()>', status: 'todo' }] }));
  const draft = updateFormDraft(assist, createFormDraft(assist), { requestedItem: '</textarea><script>bad()</script>' });
  const html = renderFormAssistance({ assistance: assist, draft });
  assert.doesNotMatch(html, /<script>|<iframe|onmouseover="bad/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /id="form-source-file"/);
  assert.match(html, /data-form-field="requestedItem"/);
  assert.match(html, /role="status"/);
});

test('draft calculation never invokes a network API or signs/completes the source request', async () => {
  const input = notice();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('No form preparation network calls allowed'); };
  try {
    const assist = getFormAssistance(input);
    const draft = updateFormDraft(assist, createFormDraft(assist), { caseName: 'Local fictional resident', originalReviewed: true, signatureNeeded: true });
    toPdfFieldValues(assist, draft);
    renderFormAssistance({ assistance: assist, draft });
    formDraftSummary(assist, draft);
    assert.equal(calls, 0);
    assert.equal(input.requests[0].status, 'todo');
    assert.equal(assessFormDraft(assist, draft).submitted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
