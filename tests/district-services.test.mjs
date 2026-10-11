import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({
  entryPoints: ['src/domain/district-services.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const services = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

test('county directory requires explicit county choice and never infers a district from ZIP or address', () => {
  assert.deepEqual(services.COUNTY_IDS, ['santa-clara', 'san-mateo']);
  for (const county of services.COUNTY_IDS) {
    const item = services.getCountyServices(county);
    assert.equal(item.id, county);
    assert.equal(item.applyUrl, 'https://benefitscal.com/');
    assert.equal(item.programs.length, 3);
    assert.ok(item.sources.every((source) => source.checkedAt === '2026-10-11'));
  }
  for (const value of [
    null,
    undefined,
    '',
    '94043',
    '95112',
    'Santa Clara County',
    { county: 'santa-clara' },
    'unknown',
    '__proto__',
    'constructor',
  ]) {
    assert.equal(services.getCountyServices(value), null);
  }
  assert.match(services.DISTRICT_CONTEXT.coverage, /parts of/);
  assert.match(services.DISTRICT_CONTEXT.boundaryNote, /January 3, 2027/);
  assert.match(services.DISTRICT_CONTEXT.currentMapUrl, /cd119/);
  assert.notEqual(
    services.DISTRICT_CONTEXT.currentMapUrl,
    services.DISTRICT_CONTEXT.electionMapUrl,
  );
});

test('program guidance does not imply guided PDFs or notice extraction for unsupported programs', () => {
  assert.deepEqual(services.PROGRAM_CAPABILITIES.calfresh.guidedForms, ['cf37', 'sar7b']);
  assert.ok(services.PROGRAM_CAPABILITIES.calfresh.noticeExtraction.includes('CF 377.2'));
  for (const id of [
    'medi-cal',
    'medicare',
    'ssi',
    'ssdi',
    'housing',
    'wic',
    'energy',
    'unemployment',
  ]) {
    assert.equal(services.PROGRAM_CAPABILITIES[id].sourceGuidance, true);
    assert.deepEqual(services.PROGRAM_CAPABILITIES[id].guidedForms, []);
    assert.deepEqual(services.PROGRAM_CAPABILITIES[id].noticeExtraction, []);
  }
  assert.equal(services.PROGRAM_CAPABILITIES.calworks.officialCountyLinks, true);
  assert.equal(services.PROGRAM_CAPABILITIES.calworks.sourceGuidance, false);
});
