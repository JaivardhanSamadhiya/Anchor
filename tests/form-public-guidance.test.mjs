import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
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
const policy = await load('supabase/functions/anchor-assistant/program-policy.ts');
const { officialFormFields } = await load('src/domain/form-assistance.ts');
const context = (formId, sectionId, fieldId, help = 'meaning') => ({
  formId,
  sectionId,
  fieldId,
  help,
});

test('mailing city has its own question and guidance instead of unrelated contact instructions', () => {
  const selected = context('cf37', 'identity', 'mailingCity');
  const publicHelp = policy.publicFormKnowledge(selected);
  assert.equal(publicHelp.question, 'CITY');
  assert.match(publicHelp.guidance, /city used in your mailing address/);
  assert.match(publicHelp.guidance, /street name alone does not identify a city/);
  assert.doesNotMatch(publicHelp.guidance, /case name|case number|text-message/);
  assert.match(policy.formContextPreview(selected), /Mailing city/);
  const prompt = JSON.parse(policy.geminiPrompt(policy.createFormContextRequest(selected)));
  assert.equal(prompt.publicForm.question, 'CITY');
  assert.equal(prompt.publicForm.guidance, publicHelp.guidance);
  assert.deepEqual(prompt.allowedCitations, ['cf37']);
});

test('each mailing component receives specific bilingual public help without an address lookup claim', () => {
  for (const [id, question, en, es] of [
    ['mailingStreet', 'MAILING ADDRESS', /street address/, /dirección/],
    ['mailingCity', 'CITY', /does not look up your address/, /no busca su dirección/],
    ['mailingState', 'STATE', /abbreviation is CA/, /abreviatura es CA/],
    ['mailingZip', 'ZIP CODE', /Do not guess the ZIP code/, /No adivine el código postal/],
  ]) {
    const selected = context('cf37', 'identity', id);
    assert.equal(policy.publicFormKnowledge(selected).question, question);
    assert.match(policy.publicFormKnowledge(selected).guidance, en);
    assert.match(policy.publicFormKnowledge(selected, 'es').guidance, es);
  }
  // Fields without a reviewed override still use the reviewed section guidance.
  assert.equal(
    policy.publicFormKnowledge(context('cf37', 'identity', 'caseName')).guidance,
    policy.publicFormKnowledge({ formId: 'cf37', sectionId: 'identity', help: 'meaning' }).guidance,
  );
});

test('gross help distinguishes CF 37 monthly income from SAR 7 income received in the report month', () => {
  for (const [formId, prefix, rows] of [
    ['cf37', 'job', 3],
    ['sar7b', 'income', 4],
  ]) {
    const editableIds = new Set(officialFormFields(formId).map((field) => field.id));
    for (let row = 1; row <= rows; row++) {
      const id = `${prefix}${row}Gross`;
      assert.ok(editableIds.has(id), `${id} must exist on the actual editable form`);
      const selected = context(formId, 'income', id, 'how-to-answer');
      assert.ok(policy.parseFormContext(selected));
      const help = policy.publicFormKnowledge(selected);
      assert.match(help.guidance, /before deductions/);
      assert.match(help.guidance, /not take-home pay/);
      assert.match(policy.publicFormKnowledge(selected, 'es').guidance, /antes de deducciones/);
      if (formId === 'cf37') {
        assert.equal(help.question, 'Monthly Gross Amount of Income');
        assert.match(help.guidance, /single paycheck unless/);
        assert.match(help.guidance, /ask the county for help rather than guessing/);
      } else {
        assert.match(help.guidance, /actually received.*report month/);
        assert.match(help.guidance, /expected changes separately/);
        assert.match(help.guidance, /instead of guessing a monthly conversion/);
      }
      assert.ok(policy.parseAssistantRequest(policy.createFormContextRequest(selected)));
    }
  }
  // A reviewed ID cannot be moved into an unrelated section or extended with private text.
  assert.equal(policy.parseFormContext(context('cf37', 'identity', 'job1Gross')), null);
  assert.equal(
    policy.parseFormContext({
      ...context('cf37', 'income', 'job1Gross'),
      answer: 'fictional answer',
    }),
    null,
  );
});

test('SAR 7 report-period and missing-proof guidance answers the selected part with its limits', () => {
  const report = policy.publicFormKnowledge(context('sar7b', 'report', 'reportMonth'));
  const submit = policy.publicFormKnowledge(context('sar7b', 'report', 'submitMonth'));
  assert.match(report.guidance, /not today’s month/);
  assert.match(report.guidance, /month before the submit month/);
  assert.match(submit.guidance, /month you must provide the SAR 7/);
  assert.doesNotMatch(report.guidance, /mailing options|program symbols/);
  const proof = policy.publicFormKnowledge(context('sar7b', 'income', 'incomeProof', 'documents'));
  assert.match(proof.guidance, /check stubs.*copies of checks.*employer statements/);
  assert.match(proof.guidance, /signed written statement/);
  assert.match(proof.guidance, /missing-proof\/help option/);
  assert.match(proof.guidance, /do not guarantee acceptance/);
  assert.match(
    policy.publicFormKnowledge(context('sar7b', 'income', 'incomeProof'), 'es').guidance,
    /pida|consulte al condado/,
  );
  assert.ok(proof.sources.some((item) => item.id === 'sar7ab'));
});
