import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { analyzeNotice } from '../web/engine.js';
import { DEMO_NOTICES } from '../web/data.js';

// Test the TypeScript source directly, so tests cannot accidentally exercise a
// stale checked-in browser bundle. The normal build emits the same ESM modules.
async function loadSource(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { assessContinuity, validDate } = await loadSource('src/domain/continuity.ts');
const { renderContinuity } = await loadSource('src/ui/continuity-view.ts');

function verification(id = 'verification', date = 'October 24, 2026', county = 'Santa Clara') {
  return analyzeNotice(`CalFresh CF377.6\nCounty of ${county}\nNotice Date: October 9, 2026\nPlease return the requested items by ${date}.\n[X] Pay stubs for September 2026`, { id });
}
function checked(notice) {
  for (const deadline of notice.deadlines) deadline.confirmed = true;
  notice.reviewed = true;
  return notice;
}
const workspace = (...notices) => ({ notices, events: [] });
const options = { today: '2026-10-10', capacityMinutes: 30 };
const stage = (assessment, name, index = 0) => assessment.lanes[index].nodes.find(node => node.stage === name);

test('actual fictional notice models produce a DAG without altering their facts', () => {
  const input = workspace(...DEMO_NOTICES.slice(0, 2).map(sample => analyzeNotice(sample.text, { id: sample.id })));
  const before = structuredClone(input);
  const result = assessContinuity(input, options);
  assert.deepEqual(input, before);
  assert.equal(result.lanes.length, 2);
  assert.equal(result.timeline.length, 0, 'extracted dates are not checked dates');
  assert.ok(result.unverifiedDates > 0);
  assert.ok(result.ready.every(node => node.stage === 'review'));
  const seen = new Set();
  for (const node of result.nodes) {
    assert.ok(node.dependencies.every(id => seen.has(id)), 'all edges point to earlier nodes');
    seen.add(node.id);
  }
});

test('review gates preparation until every applicable date is checked', () => {
  const notice = verification();
  notice.reviewed = true;
  let result = assessContinuity(workspace(notice), options);
  assert.equal(stage(result, 'review').state, 'ready');
  assert.equal(stage(result, 'prepare').state, 'blocked');
  assert.ok(result.lanes[0].blockers.some(blocker => blocker.code === 'deadline-unverified'));
  notice.deadlines[0].confirmed = true;
  result = assessContinuity(workspace(notice), options);
  assert.equal(stage(result, 'review').state, 'complete');
  assert.equal(stage(result, 'prepare').state, 'ready');
  assert.equal(stage(result, 'submit').state, 'blocked');
});

test('prepared does not imply submitted, receipt does not imply acknowledged', () => {
  const notice = checked(verification());
  notice.requests.forEach(request => { request.status = 'done'; });
  const input = workspace(notice);
  let result = assessContinuity(input, options);
  assert.equal(stage(result, 'submit').state, 'ready');
  assert.equal(stage(result, 'proof').state, 'blocked');
  assert.equal(stage(result, 'followup').state, 'blocked');
  input.events.push({ id: 'sent', kind: 'submitted', noticeId: notice.id, date: '2026-10-10T12:00:00', detail: 'Pay stubs', attachmentId: 'file-id' });
  result = assessContinuity(input, options);
  assert.equal(stage(result, 'submit').state, 'complete');
  assert.equal(stage(result, 'proof').state, 'complete');
  assert.equal(stage(result, 'followup').state, 'ready');
  assert.equal(result.lanes[0].acknowledgement, null);
});

test('a resident response record must refer to the latest matching submission', () => {
  const notice = checked(verification());
  const input = workspace(notice);
  input.events.push(
    { id: 'old', kind: 'submitted', noticeId: notice.id, date: '2026-10-09T12:00:00', detail: 'First upload' },
    { id: 'new', kind: 'submitted', noticeId: notice.id, date: '2026-10-10T12:00:00', detail: 'Additional upload' },
    { id: 'old-ack', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'old', date: '2026-10-10', detail: 'Worker confirmed the first upload.' },
    { id: 'foreign-ack', kind: 'acknowledged', noticeId: 'another-case', submissionEventId: 'new', date: '2026-10-10', detail: 'Wrong case.' },
    { id: 'empty-ack', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'new', date: '2026-10-10', detail: '  ' },
    { id: 'early-ack', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'new', date: '2026-10-08', detail: 'Before submission.' },
  );
  assert.equal(assessContinuity(input, options).lanes[0].acknowledgement, null);
  input.events.push({ id: 'real-record', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'new', date: '2026-10-10', detail: 'On the phone, worker said the upload arrived; review pending.' });
  const result = assessContinuity(input, options);
  assert.equal(result.lanes[0].acknowledgement.id, 'real-record');
  assert.equal(stage(result, 'followup').state, 'complete');
  assert.equal('benefitsActive' in result, false);
  assert.equal('eligibility' in result, false);
});

test('newer submission keeps its own confirmation and response requirements', () => {
  const notice = checked(verification());
  const input = workspace(notice);
  input.events.push(
    { id: 'old', kind: 'submitted', noticeId: notice.id, date: '2026-10-09', attachmentId: 'old-file' },
    { id: 'new', kind: 'submitted', noticeId: notice.id, date: '2026-10-10' },
  );
  let result = assessContinuity(input, options);
  assert.equal(stage(result, 'proof').state, 'ready', 'old file does not close the new upload');
  input.events.push({ id: 'receipt', kind: 'receipt', noticeId: notice.id, submissionEventId: 'new', date: '2026-10-10', attachmentId: 'new-file' });
  result = assessContinuity(input, options);
  assert.equal(stage(result, 'proof').state, 'complete');
  assert.equal(stage(result, 'followup').state, 'ready');
});

test('invalid, unverified and excluded dates never enter the confirmed timeline', () => {
  const notice = checked(verification());
  notice.deadlines.push(
    { id: 'invalid', kind: 'submit', date: '2026-02-30', confirmed: true },
    { id: 'unchecked', kind: 'submit', date: '2026-10-12', confirmed: false },
    { id: 'excluded', kind: 'submit', date: '2026-10-11', confirmed: true, excluded: true },
  );
  const result = assessContinuity(workspace(notice), options);
  assert.deepEqual(result.timeline.map(fact => fact.date), ['2026-10-24']);
  assert.equal(result.unverifiedDates, 2);
  assert.ok(result.lanes[0].blockers.some(blocker => blocker.factId === 'invalid'));
  for (const value of ['2026-02-29', '2026-04-31', '2026-00-01', '26-10-24', null, '9999-01-01']) assert.equal(validDate(value), false);
  assert.equal(validDate('2028-02-29'), true);
});

test('a certification end date is context only and never becomes a submission due date', () => {
  const notice = checked(analyzeNotice('CalFresh CF377.2\nCounty of Santa Clara\nYour certification ends on October 11, 2026.\n[X] Pay stubs for September 2026', { id: 'end-only' }));
  const result = assessContinuity(workspace(notice), options);
  assert.equal(result.timeline[0].contextOnly, true);
  assert.equal(stage(result, 'prepare').due, null);
  assert.equal(stage(result, 'submit').due, null);
});

test('interviews have their own preparation date and are not paperwork prerequisites', () => {
  const notice = checked(analyzeNotice('CalFresh CF377.2\nCounty of Santa Clara\nSubmit your renewal form by October 15, 2026.\nYour interview is scheduled for October 20, 2026.\n[X] Pay stubs for September 2026', { id: 'renewal' }));
  notice.requests.filter(request => request.kind !== 'interview').forEach(request => { request.status = 'done'; });
  const result = assessContinuity(workspace(notice), options);
  const interview = result.nodes.find(node => node.requestId && notice.requests.find(request => request.id === node.requestId)?.kind === 'interview');
  assert.equal(interview.due, '2026-10-20');
  assert.equal(stage(result, 'submit').due, '2026-10-15');
  assert.equal(stage(result, 'submit').state, 'ready');
  assert.ok(!stage(result, 'submit').dependencies.includes(interview.id));
});

test('same-letter competing dates require clarification, not a guessed winner', () => {
  const notice = checked(verification());
  notice.deadlines.push({ ...notice.deadlines[0], id: 'second-date', date: '2026-10-25' });
  let result = assessContinuity(workspace(notice), options);
  assert.ok(result.lanes[0].blockers.some(blocker => blocker.code === 'deadline-conflict'));
  assert.equal(stage(result, 'prepare').state, 'blocked');
  assert.deepEqual(result.timeline.map(fact => fact.date), ['2026-10-24', '2026-10-25']);
  notice.deadlines[0].excluded = true;
  notice.clarification = 'Worker clarified October 25 by phone.';
  result = assessContinuity(workspace(notice), options);
  assert.equal(stage(result, 'prepare').state, 'ready');
  assert.equal(result.timeline.length, 1);
});

test('cross-letter differences are advisory and do not silently replace either letter', () => {
  const first = checked(verification('first', 'October 24, 2026'));
  const second = checked(verification('second', 'October 25, 2026'));
  const input = workspace(first, second);
  const before = structuredClone(input);
  const result = assessContinuity(input, options);
  assert.equal(result.comparisons[0].kind, 'different-dates');
  assert.deepEqual(result.comparisons[0].dates, ['2026-10-24', '2026-10-25']);
  assert.ok(result.lanes.every(lane => !lane.blockers.length));
  assert.deepEqual(input, before);
  second.county = 'san-mateo';
  assert.equal(assessContinuity(input, options).comparisons.length, 0);
  second.county = 'unknown';
  assert.equal(assessContinuity(input, options).comparisons.length, 0);
});

test('duplicate notices are identified without deleting or combining their records', () => {
  const first = checked(verification('first'));
  const second = checked(verification('second'));
  const result = assessContinuity(workspace(first, second), options);
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].kind, 'duplicate-notice');
  assert.equal(result.lanes.length, 2);
  assert.equal(result.nodes.filter(node => node.stage === 'prepare').length, first.requests.length + second.requests.length);
});

test('evidence reuse requires matching wording, known region and a prepared source', () => {
  const source = checked(verification('source'));
  const target = checked(verification('target'));
  const input = workspace(source, target);
  assert.equal(assessContinuity(input, options).evidenceCandidates.length, 0);
  source.requests.find(request => request.kind === 'document').status = 'done';
  let result = assessContinuity(input, options);
  assert.equal(result.evidenceCandidates.length, 1);
  assert.equal(result.evidenceCandidates[0].chosen, false);
  const candidate = result.evidenceCandidates[0];
  input.events.push({ id: 'reuse', kind: 'evidence-reused', noticeId: target.id, requestId: candidate.targetRequest.id, sourceNoticeId: source.id, sourceRequestId: candidate.sourceRequest.id, date: '2026-10-10', detail: 'Checked that both requests concern September income for the same person.' });
  result = assessContinuity(input, options);
  assert.equal(result.evidenceCandidates[0].chosen, true);
  assert.equal(candidate.targetRequest.status, 'todo', 'reuse is not an automatic preparation checkmark');
  assert.equal(stage(result, 'submit', 1).state, 'blocked');
  target.requests.find(request => request.kind === 'document').quote = '[X] Pay stubs for October 2026';
  assert.equal(assessContinuity(input, options).evidenceCandidates.length, 0, 'period difference cannot reuse');
  target.requests.find(request => request.kind === 'document').quote = candidate.sourceRequest.quote;
  target.county = 'san-mateo';
  assert.equal(assessContinuity(input, options).evidenceCandidates.length, 0);
});

test('capacity comparison is reversible, deterministic and uses only ready nodes', () => {
  const first = checked(verification('first', 'October 14, 2026'));
  const second = checked(verification('second', 'October 24, 2026'));
  const input = workspace(first, second);
  const before = structuredClone(input);
  const short = assessContinuity(input, { ...options, capacityMinutes: 15 });
  const long = assessContinuity(input, { ...options, capacityMinutes: 60 });
  assert.ok(short.allocatedMinutes <= 15);
  assert.ok(long.allocatedMinutes <= 60);
  assert.ok(short.session.length < long.session.length);
  assert.ok(long.session.every(node => node.state === 'ready'));
  assert.equal(long.session[0].noticeId, first.id, 'earlier checked action date appears first');
  assert.deepEqual(assessContinuity(input, { ...options, capacityMinutes: 15 }), short);
  assert.deepEqual(input, before);
  assert.equal(assessContinuity(input, { ...options, capacityMinutes: -10 }).capacityMinutes, 30);
});

test('service-region calendar math handles daylight saving without 23-hour errors', () => {
  const input = workspace(checked(verification()));
  input.notices[0].deadlines[0].date = '2026-11-02';
  const result = assessContinuity(input, { today: new Date('2026-11-01T08:30:00Z') });
  assert.equal(result.today, '2026-11-01');
  assert.equal(result.timeline[0].days, 1);
  assert.equal(assessContinuity(input, { today: 'invalid clock' }).timeline[0].days, null);
});

test('unsupported notices abstain even if imported objects contain requests and checked dates', () => {
  const notice = checked(verification());
  notice.supported = false;
  const result = assessContinuity(workspace(notice), options);
  assert.equal(result.timeline.length, 0);
  assert.equal(result.ready.length, 0);
  assert.ok(result.lanes[0].blockers.some(blocker => blocker.code === 'unsupported'));
});

test('the UI escapes resident strings and clearly separates records from agency decisions', () => {
  const notice = checked(verification('<img src=x onerror=alert(1)>'));
  notice.title = '<script>bad()</script>';
  notice.filename = '" onfocus="alert(2)';
  notice.requests[0].title = '<iframe src=evil>';
  const input = workspace(notice);
  input.events.push({ id: 'submission', kind: 'submitted', noticeId: notice.id, date: '2026-10-10', detail: 'Uploaded documents' });
  input.events.push({ id: 'ack', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'submission', date: '2026-10-10', detail: '<img src=bad onerror=bad()>' });
  const html = renderContinuity({ workspace: input, today: options.today });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot; onfocus=&quot;'));
  assert.ok(html.includes('Recorded by you'));
  assert.ok(html.includes('do not establish approval, eligibility, or continuing benefits'));
  assert.ok(html.includes('data-action="continuity-capacity"'));
});

test('Spanish guide text and keyboard-native details are available without mutations', () => {
  const input = workspace(checked(verification()));
  const before = structuredClone(input);
  const html = renderContinuity({ workspace: input, lang: 'es', today: options.today, capacityMinutes: 15 });
  assert.ok(html.includes('¿En qué puedo enfocarme hoy?'));
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('<summary'));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.deepEqual(input, before);
});

test('empty workspace has an honest first step instead of a score or fictional progress', () => {
  const input = workspace();
  assert.deepEqual(assessContinuity(input, options).session, []);
  const html = renderContinuity({ workspace: input });
  assert.ok(html.includes('Add a notice'));
  assert.ok(!html.includes('risk score'));
});

test('a fully recorded workflow is described as up to date without implying benefit approval', () => {
  const notice = checked(verification());
  notice.requests.forEach(request => { request.status = 'done'; });
  const input = workspace(notice);
  input.events.push(
    { id: 'submission', kind: 'submitted', noticeId: notice.id, date: '2026-10-10', attachmentId: 'receipt-file', detail: 'Pay stubs sent.' },
    { id: 'response', kind: 'acknowledged', noticeId: notice.id, submissionEventId: 'submission', date: '2026-10-10', detail: 'Worker said upload received; review pending.' },
  );
  const assessment = assessContinuity(input, options);
  assert.ok(assessment.nodes.every(node => node.state === 'complete'));
  const html = renderContinuity({ workspace: input, today: options.today });
  assert.ok(html.includes('Your recorded workflow steps are up to date.'));
  assert.ok(!html.includes('The next steps need a human review.'));
  assert.ok(html.includes('do not establish approval, eligibility, or continuing benefits'));
});
