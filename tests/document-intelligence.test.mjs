import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const source = await build({ entryPoints: ['src/domain/document-intelligence.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { loadDocumentModel, classifyDocument, inspectDocumentText, extractMonthCandidates, extractAmountCandidates, documentKindLabel, validReportingMonth } = await import(`data:text/javascript;base64,${Buffer.from(source.outputFiles[0].text).toString('base64')}`);
const modelBytes = await readFile('web/models/document-classifier.v1.json');
const model = loadDocumentModel(JSON.parse(modelBytes));
const corpusBytes = await readFile('web/models/document-training-fixtures.v1.json');
const corpus = JSON.parse(corpusBytes);
const report = JSON.parse(await readFile('web/models/evaluation.json', 'utf8'));

test('the versioned local artifact proves provenance and keeps test excerpts held out', () => {
  assert.equal(model.provenance.corpusSha256, createHash('sha256').update(corpusBytes).digest('hex'));
  assert.equal(report.modelSha256, createHash('sha256').update(modelBytes).digest('hex'));
  assert.equal(model.provenance.testUsedForTraining, false);
  const training = new Set(Object.values(corpus.train).flat().map(text => text.trim().toLowerCase()));
  assert.ok(corpus.test.every(example => !training.has(example.text.trim().toLowerCase())));
  assert.equal(report.userStudy.participants, 0);
  assert.match(report.scope, /fictional.*not real-world/i);
});

test('actual browser inference reproduces the separately authored held-out evaluation', () => {
  for (const example of corpus.test) {
    const actual = classifyDocument(example.text, model);
    const recorded = report.results.find(row => row.id === example.id);
    assert.equal(actual.kind, recorded.actual, example.id);
    assert.ok(Math.abs(actual.score - recorded.score) < 0.000001, example.id);
    assert.equal(actual.needsConfirmation, true);
    assert.equal(actual.modelVersion, model.version);
  }
});

test('English and Spanish pay statements and rent proofs have useful local suggestions', () => {
  for (const kind of ['paystub', 'rent-proof']) {
    const examples = corpus.test.filter(example => example.label === kind);
    assert.equal(examples.length, 4);
    for (const example of examples) {
      const result = classifyDocument(example.text, model);
      assert.equal(result.kind, kind, example.id);
      assert.ok(result.evidenceTerms.length);
      assert.ok(result.reasons.includes('suggestion-needs-resident-confirmation'));
    }
  }
});

test('sparse, mixed, unfamiliar and unsupported text abstains rather than pretending to know', () => {
  for (const text of [...corpus.abstention, '', 'hello $1', 'birth September rent payroll water passport']) {
    assert.equal(classifyDocument(text, model).kind, 'unknown', text);
  }
  for (const example of corpus.test.filter(example => example.label === 'other')) {
    assert.equal(classifyDocument(example.text, model).kind, 'unknown', example.id);
  }
});

test('malformed public artifacts fail closed', () => {
  const invalid = [null, {}, { ...model, schemaVersion: 2 }, { ...model, weights: [[]] }, { ...model, labels: ['paystub'] },
    { ...model, idf: model.idf.map((value, i) => i ? value : NaN) }, { ...model, abstention: { ...model.abstention, minKnownWords: 0 } },
    { ...model, provenance: { ...model.provenance, testUsedForTraining: true } }];
  invalid.forEach(value => assert.throws(() => loadDocumentModel(value), /model/i));
});

test('bounded inference discloses truncated input and does not mutate it or the model', () => {
  const before = JSON.stringify(model);
  const text = corpus.test.find(example => example.label === 'paystub').text + '\n'.repeat(100_001);
  const result = inspectDocumentText(text, model);
  assert.equal(result.classification.truncated, true);
  assert.ok(result.classification.reasons.includes('text-was-shortened'));
  assert.equal(JSON.stringify(model), before);
});

test('reporting period and payment date candidates retain exact spans separately', () => {
  const text = 'Employee: Fictional Example\r\nPay period: September 2026\r\nPay date: October 2, 2026\r\nGross pay: $1,234.50\r\nNet pay $950.00';
  const result = inspectDocumentText(text, model);
  assert.deepEqual(result.months.map(item => [item.month, item.role]), [['2026-09', 'reporting'], ['2026-10', 'payment']]);
  assert.deepEqual(result.amounts.map(item => [item.kind, item.cents]), [['gross-income', 123450], ['net-income', 95000]]);
  assert.equal(result.people[0].name, 'Fictional Example');
  for (const fact of [...result.months, ...result.amounts, ...result.people]) {
    assert.equal(text.slice(fact.start, fact.end), fact.quote);
    assert.equal(text.slice(0, fact.start).split(/\r\n|\r|\n/).length, fact.line);
  }
});

test('Spanish periods and explicit labeled amounts stay source anchored', () => {
  const text = 'Período de pago: septiembre de 2026\nFecha de pago: octubre 2, 2026\nSalario bruto $900.25\nPago neto $740.00\nRenta mensual: $1,400.00';
  const periods = extractMonthCandidates(text);
  assert.deepEqual(periods.map(item => [item.month, item.role]), [['2026-09', 'reporting'], ['2026-10', 'payment']]);
  const amounts = extractAmountCandidates(text);
  assert.deepEqual(amounts.map(item => [item.kind, item.cents]), [['gross-income', 90025], ['net-income', 74000], ['rent', 140000]]);
  amounts.forEach(item => assert.equal(text.slice(item.start, item.end), item.quote));
  assert.match(documentKindLabel('paystub', 'es'), /nómina/);
});

test('missing years, impossible dates and ambiguous numeric date order are not guessed', () => {
  assert.equal(extractMonthCandidates('Pay period September; paid 10/11/2026; February 30, 2026; 2026-02-29').length, 0);
  assert.equal(extractMonthCandidates('Período 30 de febrero de 2026').length, 0);
  assert.equal(extractMonthCandidates('Fecha de pago 2 de octubre de 2026')[0].role, 'payment');
  assert.equal(extractMonthCandidates('Pay period 09/30/2026')[0].month, '2026-09');
  assert.equal(extractMonthCandidates('Pay period 2028-02-29')[0].month, '2028-02');
  for (const value of ['2026-00', '2026-13', '2026-9', 'September', '2026-09-30']) assert.equal(validReportingMonth(value), false);
  assert.equal(validReportingMonth('2026-09'), true);
});

test('unlabeled dollar amounts and money in examples are not assumed to be gross pay', () => {
  assert.deepEqual(extractAmountCandidates('Total $600.00; balance $800.00; paid $1200.00'), []);
  assert.equal(extractAmountCandidates('Gross pay $1800.00; Net pay $1300.00')[0].cents, 180000);
});
