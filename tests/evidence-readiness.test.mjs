import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const source = await build({
  entryPoints: ['src/domain/evidence-readiness.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { evaluateEvidenceReadiness, requestDocumentKind } = await import(
  `data:text/javascript;base64,${Buffer.from(source.outputFiles[0].text).toString('base64')}`
);
function notice(quote = 'Pay stubs for September 2026', id = 'notice') {
  return {
    id,
    title: 'Fictional CalFresh request',
    supported: true,
    deadlines: [],
    requests: [
      {
        id: `${id}-income`,
        title: 'Income proof',
        kind: 'document',
        status: 'todo',
        quote,
        start: 40,
        end: 40 + quote.length,
        line: 3,
      },
    ],
  };
}
function doc(month = '2026-09', extra = {}) {
  return {
    id: 'pay',
    name: 'Fictional paystub.pdf',
    noticeId: 'notice',
    confirmation: { kind: 'paystub', month, person: 'Jordan Example', checked: true },
    ...extra,
  };
}
const check = (documents, notices = [notice()], extra = {}) =>
  evaluateEvidenceReadiness({ notices, documents, ...extra });

test('a requested evidence item without a file is visible even when checklist was marked done', () => {
  const n = notice();
  n.requests[0].status = 'done';
  const result = check([], [n]);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.requests[0].status, 'missing');
  assert.equal(result.findings[0].code, 'missing-evidence');
  assert.equal(result.findings[0].source.quote, n.requests[0].quote);
  assert.equal(n.requests[0].status, 'done');
});

test('wrong confirmed reporting month gives an anchored correction prompt', () => {
  const result = check([doc('2026-08')]);
  const finding = result.findings.find((item) => item.code === 'wrong-reporting-month');
  assert.ok(finding);
  assert.equal(finding.severity, 'attention');
  assert.deepEqual(finding.documentIds, ['pay']);
  assert.match(finding.message, /2026-09.*2026-08/);
  assert.equal(result.requests[0].status, 'needs-review');
});

test('a model suggestion is not a confirmed document fact', () => {
  const result = check([
    {
      id: 'pay',
      name: 'Unreviewed file',
      noticeId: 'notice',
      insight: { classification: { kind: 'paystub' } },
      confirmation: { kind: 'paystub', month: '2026-09', checked: false },
    },
  ]);
  assert.ok(result.findings.some((item) => item.code === 'unconfirmed-document'));
  assert.equal(result.checkedDocuments, 0);
  assert.equal(result.requests[0].status, 'needs-review');
});

test('a matching checked document is only an advisory candidate and input stays unchanged', () => {
  const input = { notices: [notice()], documents: [doc()] };
  const before = structuredClone(input);
  const result = evaluateEvidenceReadiness(input);
  assert.equal(result.requests[0].status, 'matched');
  assert.equal(result.summary.matched, 1);
  assert.equal(result.findings.length, 0);
  assert.deepEqual(input, before);
  assert.equal('approved' in result, false);
  assert.equal('eligible' in result, false);
});

test('different notices, selected requests and documentary kinds are kept separate', () => {
  assert.equal(check([doc('2026-09', { noticeId: 'other' })]).summary.missing, 1);
  assert.equal(check([doc('2026-09', { requestIds: ['another-request'] })]).summary.missing, 1);
  assert.equal(
    check([doc('2026-09', { confirmation: { kind: 'identity', checked: true } })]).summary.missing,
    1,
  );
  const two = check([doc()], [notice(), notice('Pay stubs for September 2026', 'other')]);
  assert.equal(two.summary.matched, 1);
  assert.equal(two.summary.missing, 1);
});

test('multiple requested months and unknown document categories remain manual review', () => {
  const several = check([doc()], [notice('Pay stubs for August 2026 and September 2026')]);
  assert.equal(several.requests[0].requiredMonth, null);
  assert.ok(several.findings.some((item) => item.code === 'multiple-reporting-months'));
  const unknown = check([], [notice('Provide court records')]);
  assert.equal(unknown.requests[0].status, 'needs-review');
  assert.equal(unknown.findings[0].code, 'manual-request');
  const unsupported = notice();
  unsupported.supported = false;
  assert.equal(check([doc()], [unsupported]).findings[0].code, 'manual-request');
});

test('missing month is requested explicitly and pay/print dates are never borrowed', () => {
  const d = doc();
  delete d.confirmation.month;
  d.insight = {
    months: [{ month: '2026-09', role: 'payment' }],
    classification: { kind: 'paystub' },
  };
  assert.ok(check([d]).findings.some((item) => item.code === 'missing-reporting-month'));
  const noYear = check([doc('2026-08')], [notice('Pay stubs for September')]);
  assert.equal(noYear.requests[0].requiredMonth, null);
  assert.ok(!noYear.findings.some((item) => item.code === 'wrong-reporting-month'));
  assert.ok(noYear.findings.some((item) => item.code === 'missing-reporting-month'));
});

test('monthly gross compares same person and explicit basis; net and individual payments never substitute', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'cf37',
    answers: { job1Name: 'Jordan Example', job1Gross: '1800.00' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    amountCents: 170000,
    amountKind: 'gross-income',
    amountBasis: 'monthly',
  });
  let result = check([d], undefined, { formDrafts: [draft] });
  assert.equal(
    result.findings.find((item) => item.code === 'amount-mismatch').fieldId,
    'job1Gross',
  );
  d.confirmation.amountBasis = 'per-payment';
  assert.ok(
    !check([d], undefined, { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
  );
  d.confirmation.amountBasis = 'monthly';
  d.confirmation.amountKind = 'net-income';
  assert.ok(
    !check([d], undefined, { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
  );
  d.confirmation.amountKind = 'gross-income';
  d.confirmation.person = 'Someone Else';
  assert.ok(
    !check([d], undefined, { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
  );
});

test('SAR7 reporting-month discrepancies remain visible without comparing rent across periods', () => {
  const d = doc();
  Object.assign(d.confirmation, {
    kind: 'rent-proof',
    amountCents: 140000,
    amountKind: 'rent',
    amountBasis: 'monthly',
  });
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'sar7b',
    answers: { reportMonth: 'August 2026', rent: '1300.00' },
    updatedAt: '2026-10-12',
  };
  const result = check([d], [notice('Proof of rent for September 2026')], { formDrafts: [draft] });
  assert.ok(
    result.findings.some(
      (item) => item.code === 'form-period-mismatch' && item.fieldId === 'reportMonth',
    ),
  );
  assert.ok(!result.findings.some((item) => item.code === 'amount-mismatch'));
  draft.answers.reportMonth = 'September 2026';
  const samePeriod = check([d], [notice('Proof of rent for September 2026')], {
    formDrafts: [draft],
  });
  assert.ok(
    samePeriod.findings.some((item) => item.code === 'amount-mismatch' && item.fieldId === 'rent'),
  );
  assert.ok(!samePeriod.findings.some((item) => item.code === 'form-period-mismatch'));
});

test('SAR7 gross compares an undated request only against its known form reporting month', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'sar7b',
    answers: { reportMonth: 'August 2026', income1Name: 'Jordan Example', income1Gross: '1800.00' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    amountCents: 170000,
    amountKind: 'gross-income',
    amountBasis: 'monthly',
  });
  const n = notice('Provide your pay stubs');
  const checkAmount = () =>
    check([d], [n], { formDrafts: [draft] }).findings.filter(
      (item) => item.code === 'amount-mismatch',
    );
  assert.deepEqual(checkAmount(), [], 'September proof cannot contradict an August SAR7 total');
  d.confirmation.month = '2026-08';
  assert.equal(checkAmount()[0].fieldId, 'income1Gross');
  draft.answers.income1Gross = '1700.00';
  assert.deepEqual(
    checkAmount(),
    [],
    'same-period matching monthly gross does not produce a mismatch',
  );
  draft.answers.income1Gross = '1800.00';
  d.confirmation.amountBasis = 'per-payment';
  assert.deepEqual(
    checkAmount(),
    [],
    'same month still cannot make a single paycheck a monthly gross total',
  );
  d.confirmation.amountBasis = 'monthly';
  d.confirmation.amountKind = 'net-income';
  assert.deepEqual(checkAmount(), [], 'same month still cannot substitute net for gross income');
  d.confirmation.amountKind = 'gross-income';
  for (const uncertain of ['', 'August', '2026-13', 'August 2026 and September 2026']) {
    draft.answers.reportMonth = uncertain;
    assert.deepEqual(
      checkAmount(),
      [],
      `uncertain SAR7 period must not create arithmetic findings: ${uncertain}`,
    );
  }
  draft.answers.reportMonth = 'August 2026';
  for (const month of [undefined, '2026-13']) {
    d.confirmation.month = month;
    assert.deepEqual(
      checkAmount(),
      [],
      'a missing or invalid checked document month is not a shared period',
    );
  }
});

test('SAR7 rent uses a known shared period and never substitutes income or individual payment amounts', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'sar7b',
    answers: { reportMonth: 'September 2026', rent: '1300.00' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    kind: 'rent-proof',
    amountCents: 140000,
    amountKind: 'rent',
    amountBasis: 'monthly',
  });
  const n = notice('Provide your rent receipt');
  const mismatches = () =>
    check([d], [n], { formDrafts: [draft] }).findings.filter(
      (item) => item.code === 'amount-mismatch',
    );
  assert.equal(mismatches()[0].fieldId, 'rent');
  d.confirmation.month = '2026-08';
  assert.deepEqual(mismatches(), []);
  d.confirmation.month = '2026-09';
  d.confirmation.amountBasis = 'per-payment';
  assert.deepEqual(mismatches(), []);
  d.confirmation.amountBasis = 'monthly';
  d.confirmation.amountKind = 'net-income';
  assert.deepEqual(mismatches(), []);
});

test('conflicting or unresolved notice periods cannot be replaced by the SAR7 month for gross checks', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'sar7b',
    answers: { reportMonth: 'August 2026', income1Name: 'Jordan Example', income1Gross: '1800.00' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    amountCents: 170000,
    amountKind: 'gross-income',
    amountBasis: 'monthly',
  });
  const conflicting = check([d], [notice()], { formDrafts: [draft] });
  assert.ok(conflicting.findings.some((item) => item.code === 'form-period-mismatch'));
  assert.ok(!conflicting.findings.some((item) => item.code === 'amount-mismatch'));
  draft.answers.reportMonth = 'September 2026';
  for (const quote of [
    'Pay stubs for August 2026 and September 2026',
    'Pay stubs for September',
    'Pay stubs for the reporting period',
    'Pay stubs for last month',
  ]) {
    const result = check([d], [notice(quote)], { formDrafts: [draft] });
    assert.ok(!result.findings.some((item) => item.code === 'amount-mismatch'), quote);
    assert.ok(
      result.findings.some((item) =>
        ['missing-reporting-month', 'multiple-reporting-months'].includes(item.code),
      ),
      quote,
    );
  }
  draft.answers.reportMonth = '';
  assert.ok(
    !check([d], [notice()], { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
    'a known notice month cannot silently establish an unset SAR7 report month',
  );
});

test('CF37 without a report-month field still requires an explicit compatible notice period for amount checks', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'cf37',
    answers: { job1Name: 'Jordan Example', job1Gross: '1800.00' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    amountCents: 170000,
    amountKind: 'gross-income',
    amountBasis: 'monthly',
  });
  assert.ok(
    check([d], [notice()], { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
  );
  assert.ok(
    !check([d], [notice('Provide your pay stubs')], { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
    'confirmed document month alone does not establish the form reporting period',
  );
  d.confirmation.month = '2026-08';
  const wrongPeriod = check([d], [notice()], { formDrafts: [draft] });
  assert.ok(wrongPeriod.findings.some((item) => item.code === 'wrong-reporting-month'));
  assert.ok(!wrongPeriod.findings.some((item) => item.code === 'amount-mismatch'));
});

test('multiple income records never produce an assumed monthly sum', () => {
  const draft = {
    version: 1,
    id: 'form',
    noticeId: 'notice',
    formId: 'cf37',
    answers: { job1Name: 'Jordan Example', job1Gross: '9999' },
    updatedAt: '2026-10-12',
  };
  const d = doc();
  Object.assign(d.confirmation, {
    amountCents: 170000,
    amountKind: 'gross-income',
    amountBasis: 'monthly',
  });
  assert.ok(
    !check([d, { ...d, id: 'second' }], undefined, { formDrafts: [draft] }).findings.some(
      (item) => item.code === 'amount-mismatch',
    ),
  );
});

test('duplicates use exact content hashes or full normalized text; fingerprints do not prove duplicates', () => {
  const hash = 'a'.repeat(64);
  const result = check([
    { ...doc(), sha256: hash },
    { ...doc(), id: 'copy', sha256: hash },
  ]);
  assert.equal(result.summary.duplicateGroups, 1);
  assert.equal(
    result.findings.find((item) => item.code === 'duplicate-file').documentIds.length,
    2,
  );
  const text =
    'An entirely fictional long document for testing repeated text. The original images may differ from this extracted text.';
  assert.ok(
    check([
      { ...doc(), text },
      { ...doc(), id: 'copy', text: text.toUpperCase() },
    ]).findings.some((item) => item.code === 'duplicate-text'),
  );
  const colliding = check([
    { ...doc(), insight: { textFingerprint: 'same' } },
    { ...doc(), id: 'other', insight: { textFingerprint: 'same' } },
  ]);
  assert.equal(colliding.summary.duplicateGroups, 0);
});

test('form and interview steps are not mistaken for missing evidence', () => {
  const n = notice();
  n.requests.push(
    { id: 'form', title: 'Return form', kind: 'form', status: 'todo' },
    { id: 'call', title: 'Interview', kind: 'interview', status: 'todo' },
  );
  assert.equal(check([doc()], [n]).summary.requirements, 1);
});

test('Spanish findings preserve dates and original source evidence', () => {
  const result = check(
    [doc('2026-08')],
    [notice('Comprobantes de ingresos para septiembre de 2026')],
    { language: 'es' },
  );
  const finding = result.findings.find((item) => item.code === 'wrong-reporting-month');
  assert.match(finding.title, /otro mes/);
  assert.match(finding.message, /2026-09.*2026-08/);
  assert.equal(finding.source.quote, 'Comprobantes de ingresos para septiembre de 2026');
  assert.equal(
    requestDocumentKind({ title: '', quote: 'Contrato de arrendamiento' }),
    'rent-proof',
  );
});
