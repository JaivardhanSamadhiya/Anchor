import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function source(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { getFormAssistance } = await source('src/domain/form-assistance.ts');
const { localizeFormAssistance } = await source('src/domain/spanish-form-guide.ts');
function assistance(code, kind = 'form') {
  return getFormAssistance({ id: `notice-${code}`, supported: true, program: 'CalFresh', type: 'verification',
    sourceText: `CalFresh ${code}`, deadlines: [], requests: [{ id: 'request', title: `Return ${code}`, kind, quote: `Return ${code}`, status: 'todo' }] });
}
for (const code of ['CF37', 'SAR7B']) {
  test(`${code}: every app field label and guidance paragraph has Spanish wording while mappings remain exact`, () => {
    const original = assistance(code);
    const snapshot = structuredClone(original);
    const spanish = localizeFormAssistance(original, 'es');
    assert.deepEqual(original, snapshot, 'translation does not mutate the original guidance');
    assert.deepEqual(spanish.form, original.form, 'official metadata and PDF language remain unchanged');
    assert.equal(spanish.title, original.title);
    assert.match(spanish.rationale, /el PDF oficial mostrado conserva su idioma original/);
    for (const [sectionIndex, section] of spanish.sections.entries()) {
      const old = original.sections[sectionIndex];
      assert.notEqual(section.title, old.title, old.title);
      assert.notEqual(section.description, old.description, old.description);
      for (const [index, field] of section.fields.entries()) {
        const prior = old.fields[index];
        assert.notEqual(field.label, prior.label, `Spanish wording required: ${prior.label}`);
        const { label: _label, help: _help, choices: _choices, ...contract } = field;
        const { label: _oldLabel, help: _oldHelp, choices: _oldChoices, ...oldContract } = prior;
        assert.deepEqual(contract, oldContract, `${prior.id}: field identity, visibility and PDF mappings retained`);
        if (prior.help) assert.notEqual(field.help, prior.help, prior.help);
        if (prior.choices) assert.deepEqual(field.choices.map((choice) => choice.value), prior.choices.map((choice) => choice.value));
      }
    }
    for (const [index, item] of spanish.checklist.entries()) {
      assert.notEqual(item.title, original.checklist[index].title);
      assert.notEqual(item.detail, original.checklist[index].detail);
    }
  });
}
test('generic request guidance is translated while original request wording remains verbatim', () => {
  const original = assistance('unknown', 'income');
  const spanish = localizeFormAssistance(original, 'es');
  assert.equal(spanish.title, original.title);
  assert.equal(spanish.form, null);
  assert.equal(spanish.sections[0].title, 'Comprende esta solicitud');
  assert.equal(spanish.sections[0].fields[0].label, '¿Qué se solicita?');
  assert.match(spanish.rationale, /formulario real proporcionado por la agencia/);
});
test('English returns an independent unchanged contract and repeated table rows remain unambiguous', () => {
  const original = assistance('SAR7B');
  const english = localizeFormAssistance(original, 'en');
  assert.deepEqual(english, original);
  assert.notEqual(english, original);
  const spanish = localizeFormAssistance(original, 'es');
  const labels = spanish.sections.flatMap((section) => section.fields.map((field) => field.label));
  assert.ok(labels.some((label) => label === 'Ingreso 4 · Empleador, línea 2'));
  assert.ok(labels.some((label) => label === 'Persona 2 · Fecha de nacimiento (MM/DD/YYYY)'));
  assert.ok(labels.some((label) => label.startsWith('Solo ayuda monetaria ·')));
});
