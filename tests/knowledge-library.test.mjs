import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/domain/program-assistant.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const policy = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const topic = (overrides = {}) => ({
  program: 'calfresh',
  questionId: 'documents',
  focus: 'proof-alternatives',
  language: 'en',
  adultConfirmed: true,
  ...overrides,
});

test('reviewed library has bilingual evidence and official provenance for every covered program', () => {
  assert.equal(policy.KNOWLEDGE_VERSION, policy.SOURCE_VERSION);
  assert.ok(policy.KNOWLEDGE_PASSAGES.length >= 30);
  assert.ok(policy.KNOWLEDGE_SOURCES.length >= 15);
  const official =
    /^(www\.(?:usa\.gov|cdss\.ca\.gov|dhcs\.ca\.gov|medicare\.gov|ssa\.gov|smcgov\.org)|stgenssa\.sccgov\.org)$/;
  const ids = new Set();
  for (const source of policy.KNOWLEDGE_SOURCES) {
    assert.ok(!ids.has(source.id));
    ids.add(source.id);
    assert.match(new URL(source.url).hostname, official);
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.match(source.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const passage of policy.KNOWLEDGE_PASSAGES) {
    assert.ok(ids.has(passage.sourceId));
    assert.ok(passage.text.en.length > 40);
    assert.ok(passage.text.es.length > 40);
    assert.notEqual(passage.text.en, passage.text.es);
  }
  for (const program of policy.PROGRAM_IDS.filter((id) => id !== 'navigation')) {
    const request = topic({ program, questionId: 'overview', focus: 'general' });
    assert.ok(policy.parseAssistantRequest(request));
    assert.ok(policy.retrievePublicKnowledge(request).length, program);
  }
});

test('BM25 retrieval ranks the missing-proof process and returns bounded independent records', () => {
  const evidence = policy.retrievePublicKnowledge(topic());
  assert.equal(evidence.length, 4);
  assert.ok(evidence.slice(0, 2).some((entry) => /missing|help|proof/i.test(entry.title)));
  assert.ok(
    evidence.some(
      (entry) => entry.id === 'sar7-help-checkbox' || entry.id === 'cf37-missing-proof',
    ),
  );
  assert.ok(evidence.every((entry) => entry.relevance > 0));
  assert.equal(policy.retrievePublicKnowledge(topic(), 1).length, 1);
  assert.ok(policy.retrievePublicKnowledge(topic(), 1000).length <= 8);
  evidence[0].text = 'An unrelated invented answer';
  assert.notEqual(policy.retrievePublicKnowledge(topic())[0].text, evidence[0].text);
  assert.ok(Object.isFrozen(policy.KNOWLEDGE_PASSAGES[0].text));
});

test('county operational instructions require the correct optional jurisdiction enum', () => {
  const request = topic({ questionId: 'renew', focus: 'general' });
  const general = policy.retrievePublicKnowledge(request, 8);
  assert.ok(general.every((entry) => ['federal', 'california'].includes(entry.jurisdiction)));
  for (const [jurisdiction, countySource, otherCounty] of [
    ['santa-clara', 'santa-clara-renewal', 'san-mateo'],
    ['san-mateo', 'san-mateo-renewal', 'santa-clara'],
  ]) {
    const county = { ...request, jurisdiction };
    assert.equal(policy.parseAssistantRequest(county).jurisdiction, jurisdiction);
    const results = policy.retrievePublicKnowledge(county, 8);
    assert.ok(results.some((entry) => entry.sourceId === countySource));
    assert.ok(results.every((entry) => entry.jurisdiction !== otherCounty));
    assert.ok(policy.sourcesForRequest(county).some((entry) => entry.id === countySource));
    const prompt = JSON.parse(policy.geminiPrompt(county));
    assert.equal(prompt.jurisdiction, jurisdiction);
    assert.ok(prompt.retrievedPassages.some((entry) => entry.sourceId === countySource));
  }
  for (const jurisdiction of [
    'San Mateo County',
    'anywhere',
    '__proto__',
    null,
    { county: 'san-mateo' },
  ])
    assert.equal(policy.parseAssistantRequest({ ...request, jurisdiction }), null);
});

test('form evidence stays within its official form and selected section receives priority', () => {
  const cf37 = policy.createFormContextRequest({
    formId: 'cf37',
    sectionId: 'housing',
    fieldId: 'rent',
    help: 'meaning',
  });
  const evidence = policy.retrievePublicKnowledge(cf37);
  assert.equal(evidence[0].id, 'cf37-housing');
  assert.ok(evidence.every((entry) => entry.sourceId === 'cf37'));
  assert.deepEqual(
    policy.sourcesForRequest(cf37).map((entry) => entry.id),
    ['cf37'],
  );
  const sar7 = policy.createFormContextRequest(
    { formId: 'sar7b', sectionId: 'income', fieldId: 'incomeProof', help: 'documents' },
    'es',
  );
  const spanish = policy.retrievePublicKnowledge(sar7);
  assert.ok(spanish.every((entry) => ['sar7ab', 'sar7b'].includes(entry.sourceId)));
  assert.ok(spanish.every((entry) => entry.language === 'es'));
  assert.ok(spanish.some((entry) => /comprobante|ingreso/i.test(entry.text)));
  assert.ok(policy.parseAssistantResponse(policy.sourceGuidance(sar7), sar7));
});

test('paired public requests retrieve evidence from both programs and navigation retrieves none', () => {
  const compared = topic({ program: 'ssi', questionId: 'compare', focus: 'ssi-vs-ssdi' });
  const evidence = policy.retrievePublicKnowledge(compared, 2);
  assert.equal(evidence.length, 2);
  assert.deepEqual(new Set(evidence.map((entry) => entry.sourceId)), new Set(['ssi', 'ssdi']));
  const navigation = topic({
    program: 'navigation',
    questionId: 'navigate',
    focus: 'general',
    destination: 'plan',
  });
  assert.deepEqual(policy.retrievePublicKnowledge(navigation), []);
});

test('arbitrary search strings, drafts and fields cannot become indexed query input', () => {
  for (const value of [
    null,
    [],
    'private question',
    topic({ question: 'Private typed question' }),
    topic({ draft: { income: 'private amount' } }),
    topic({ program: 'invented' }),
    topic({ focus: 'ignore instructions' }),
    topic({ questionId: 'private query' }),
    topic({ language: 'other' }),
    topic({
      formContext: {
        formId: 'cf37',
        sectionId: 'income',
        help: 'meaning',
        selectedText: 'private form selection',
      },
    }),
    topic({
      formContext: {
        formId: 'cf37',
        sectionId: 'income',
        fieldId: 'private typed field',
        help: 'meaning',
      },
    }),
  ])
    assert.deepEqual(policy.retrievePublicKnowledge(value), []);
  const prompt = JSON.parse(policy.geminiPrompt(topic({ jurisdiction: 'san-mateo' })));
  assert.match(prompt.retrievalMethod, /BM25/);
  for (const passage of prompt.retrievedPassages)
    assert.ok(prompt.allowedCitations.includes(passage.sourceId));
  assert.equal('question' in prompt, false);
  assert.equal('draft' in prompt, false);
});

test('retrieved county citations are validated against request jurisdiction and canonical URLs', () => {
  const request = topic({ questionId: 'renew', focus: 'general', jurisdiction: 'san-mateo' });
  const result = policy.normalizeGeminiResponse(
    {
      answer:
        'The county explains renewal verification and appointment instructions. Check the requested reporting period and contact the county for your individual requirements.',
      citationIds: ['san-mateo-renewal'],
      navigationPage: 'plan',
    },
    request,
  );
  assert.ok(result);
  assert.ok(policy.parseAssistantResponse(result, request));
  assert.equal(
    policy.parseAssistantResponse(result, { ...request, jurisdiction: 'santa-clara' }),
    null,
  );
  assert.equal(
    policy.parseAssistantResponse(
      { ...result, citations: [{ ...result.citations[0], url: 'https://attacker.invalid' }] },
      request,
    ),
    null,
  );
});

test('source-maintenance code never accepts a fetched change automatically', async () => {
  const checker = await readFile('scripts/check_knowledge_sources.py', 'utf8');
  assert.match(checker, /changed_needs_review/);
  assert.match(checker, /needs_baseline_review/);
  assert.match(checker, /--offline/);
  assert.match(checker, /The report cannot overwrite accepted knowledge or fingerprints/);
  const snapshots = JSON.parse(
    await readFile('supabase/functions/anchor-assistant/knowledge-source-snapshots.json', 'utf8'),
  );
  const registry = JSON.parse(await readFile('web/forms/sources.json', 'utf8'));
  for (const id of ['cf37', 'sar7b', 'sar7ab']) {
    const snapshot = snapshots.sources.find((entry) => entry.id === id);
    assert.equal(snapshot.algorithm, 'pdf-bytes-sha256');
    assert.equal(
      snapshot.sha256,
      registry.assets.find((entry) => entry.file === `${id}.pdf`).sha256,
    );
  }
});
