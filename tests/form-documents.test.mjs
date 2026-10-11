import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

async function source(entry) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    define: {
      'import.meta.url': JSON.stringify(pathToFileURL(resolve('web/form-documents.js')).href),
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`
  );
}
const {
  OFFICIAL_FORMS,
  officialFormFields,
  createFormDraft,
  updateFormDraft,
  toPdfFieldValues,
  getFormAssistance,
} = await source('src/domain/form-assistance.ts');
const { fillOfficialForm, loadOfficialForm } = await source('src/infrastructure/form-documents.ts');
const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url) => {
  const filename = new URL(url).pathname.split('/').pop();
  calls.push(filename);
  const bytes = await readFile(`web/forms/${filename === 'corrupted.pdf' ? 'cf37.pdf' : filename}`);
  return new Response(bytes);
};
test.after(() => {
  globalThis.fetch = realFetch;
});
function assistance(code) {
  return getFormAssistance({
    id: `test-${code}`,
    supported: true,
    program: 'CalFresh',
    type: 'verification',
    sourceText: `CalFresh ${code}`,
    deadlines: [],
    requests: [
      {
        id: 'form',
        kind: 'form',
        title: `Return ${code}`,
        quote: `Return ${code}`,
        status: 'todo',
      },
    ],
  });
}

for (const code of ['CF37', 'SAR7B']) {
  test(`${code}: all guided mappings remain canonical, visible and editable across the full official PDF`, async () => {
    const assist = assistance(code);
    const updates = Object.fromEntries(
      officialFormFields(assist.form.id).map((field) => [
        field.id,
        field.kind === 'checkbox'
          ? true
          : field.kind === 'choice'
            ? field.choices[0].value
            : field.kind === 'money'
              ? '123.50'
              : field.help?.includes('six digits')
                ? '101026'
                : 'Sample',
      ]),
    );
    const draft = updateFormDraft(assist, createFormDraft(assist), updates);
    const values = toPdfFieldValues(assist, draft);
    const bytes = await fillOfficialForm(assist.form, values);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), assist.form.pages);
    const fields = pdf.getForm();
    const widgets = new Set(
      pdf
        .getPages()
        .flatMap((page) => (page.node.Annots()?.asArray() ?? []).map((ref) => ref.toString())),
    );
    for (const item of values) {
      const field =
        item.type === 'text' ? fields.getTextField(item.name) : fields.getCheckBox(item.name);
      assert.equal(
        item.type === 'text' ? field.getText() : field.isChecked(),
        item.value,
        item.name,
      );
      if (item.type === 'text' && item.value) {
        const appearance = field.acroField.getDefaultAppearance();
        const fontSize = Number(/\s([\d.]+)\s+Tf/.exec(appearance)?.[1]);
        assert.ok(
          fontSize >= 8 && fontSize <= 12,
          `${item.name}: readable appearance size, including merged widgets`,
        );
      }
      for (const widget of field.acroField.getWidgets()) {
        assert.equal(
          widget.getFlags() & (1 | 2 | 32),
          0,
          `${item.name}: visible in ordinary PDF readers`,
        );
        assert.equal(widget.getFlags() & 4, 4, `${item.name}: printable`);
        assert.ok(widget.getAppearances()?.normal, `${item.name} has a normal appearance`);
        assert.ok(
          widgets.has(pdf.context.getObjectRef(widget.dict).toString()),
          `${item.name} appears in page annotations`,
        );
        const parent = widget.dict.lookupMaybe(PDFName.of('Parent'), PDFDict);
        assert.ok(
          widget.dict === field.acroField.dict || parent === field.acroField.dict,
          `${item.name} widget is linked to its canonical field`,
        );
      }
    }
    assert.ok(values.length > (code === 'CF37' ? 175 : 250));
    if (code === 'CF37') assert.equal(fields.getTextField('signed_date').getText(), undefined);
    else
      for (const number of [511, 513, 515])
        assert.equal(fields.getTextField(`SAR7  ${number}`).getText(), undefined);
  });
}

test('the SAR7B derivative preserves the official pages, fields, widgets and blank defaults', async () => {
  const form = OFFICIAL_FORMS.find((item) => item.id === 'sar7b');
  const original = await readFile('web/forms/sar7b.pdf');
  await assert.rejects(PDFDocument.load(original), /encrypted/);
  const editable = await PDFDocument.load(await readFile('web/forms/sar7b-editable.pdf'));
  assert.equal(editable.getPageCount(), 14);
  assert.equal(editable.getForm().getFields().length, 304);
  assert.ok(form.editablePath && form.editableSha256);
  const registry = JSON.parse(await readFile('web/forms/sources.json', 'utf8'));
  const derived = registry.assets.find((asset) => asset.file === 'sar7b-editable.pdf');
  assert.equal(derived.derivedFrom, 'sar7b.pdf');
  assert.equal(derived.sourceSha256, form.sha256);
  assert.equal(derived.sha256, form.editableSha256);
});

test('a field that cannot fit legibly is rejected without silently clipping the answer', async () => {
  const form = OFFICIAL_FORMS.find((item) => item.id === 'cf37');
  await assert.rejects(
    fillOfficialForm(form, [
      { name: 'question6-1-3-3-1', type: 'text', value: 'W'.repeat(100), label: 'Units' },
    ]),
    /Units: This answer is too long/,
  );
  await assert.rejects(
    fillOfficialForm(form, [
      { name: 'question1-1-2', type: 'text', value: '10\/10\/2026', label: 'Move date' },
    ]),
    /no more than 6/,
  );
  await assert.rejects(
    fillOfficialForm(form, [{ name: 'case_name', type: 'text', value: 'Example\nSecond line' }]),
    /next line/,
  );
  await assert.rejects(
    fillOfficialForm(form, [{ name: 'case_name', type: 'text', value: '例子' }]),
    /cannot display/,
  );
});

test('unsigned exports allow only reviewed mappings and no conflicting values', async () => {
  const form = OFFICIAL_FORMS.find((item) => item.id === 'cf37');
  await assert.rejects(
    fillOfficialForm(form, [{ name: 'signed_date', type: 'text', value: '10\/10\/2026' }]),
    /verified field mapping/,
  );
  await assert.rejects(
    fillOfficialForm(form, [
      { name: 'case_name', type: 'text', value: 'A' },
      { name: 'case_name', type: 'text', value: 'B' },
    ]),
    /same PDF field/,
  );
});

test('cached verified blanks are immutable and a changed source cannot receive a stale mapping', async () => {
  const form = OFFICIAL_FORMS.find((item) => item.id === 'cf37');
  const before = calls.filter((filename) => filename === 'cf37.pdf').length;
  const one = await loadOfficialForm(form);
  const first = one[0];
  one[0] = 0;
  const two = await loadOfficialForm(form);
  assert.equal(two[0], first);
  assert.equal(calls.filter((filename) => filename === 'cf37.pdf').length, before);
  await assert.rejects(
    loadOfficialForm({ ...form, localPath: './forms/corrupted.pdf', sha256: '0'.repeat(64) }),
    /official form changed/i,
  );
});
