import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNotice, reconcileNotices, formatDate, daysUntil, createCalendar } from '../web/engine.js';

const options = { id: 'test-notice', filename: 'practice.txt', now: '2026-10-09T19:00:00Z', isDemo: true };
const renewal = `FICTIONAL PRACTICE NOTICE\nCounty of Santa Clara\nCalFresh Notice of Expiration of Certification\nCF 377.2\nNotice Date: October 9, 2026\nSubmit your renewal form by October 22, 2026.\nYour CalFresh certification period will end on October 31, 2026.\nYour CalFresh interview is scheduled for October 20, 2026 at 10:00 AM.\n[ ] Proof of identity\n[X] Pay stubs for September 2026\n`;
const verification = `County of Santa Clara\nCalFresh Information/Verification Needed\nCF377.6\nNotice Date: October 9, 2026\nPlease return the requested items by October 24, 2026.\n[X] Pay stubs for September 2026\n[ ] Proof of citizenship\n☑ Proof of rent for September 2026\n`;

function assertAnchors(notice) {
  for (const item of [...notice.deadlines, ...notice.requests]) {
    assert.equal(notice.sourceText.slice(item.start, item.end), item.quote, 'source quote must match exact offsets');
    assert.equal(notice.sourceText.slice(0, item.start).split(/\r\n|\r|\n/).length, item.line, 'line number must describe the source offset');
  }
}

test('renewal preserves submission, interview, and certification-end dates separately', () => {
  const notice = analyzeNotice(renewal, options);
  assert.equal(notice.supported, true);
  assert.equal(notice.program, 'CalFresh');
  assert.equal(notice.type, 'renewal');
  assert.equal(notice.formCode, 'CF377.2');
  assert.equal(notice.county, 'santa-clara');
  assert.equal(notice.noticeDate, '2026-10-09');
  assert.deepEqual(notice.deadlines.map(d => [d.kind, d.date]), [['submit', '2026-10-22'], ['end', '2026-10-31'], ['interview', '2026-10-20']]);
  assert.ok(notice.deadlines.every(d => d.confirmed === false));
  assert.ok(notice.requests.some(r => r.kind === 'form'));
  assert.ok(notice.requests.some(r => r.kind === 'interview'));
  assert.ok(notice.requests.some(r => r.quote.startsWith('[X]')));
  assert.ok(!notice.requests.some(r => r.quote.startsWith('[ ]')));
  assertAnchors(notice);
});

test('source spans survive leading spaces, CRLF, repeated text, and Unicode', () => {
  const text = verification.replaceAll('\n', '\r\n').replace('☑ Proof', '   ☑ Proof');
  const notice = analyzeNotice(text, options);
  assertAnchors(notice);
  assert.equal(notice.sourceText, text);
  assert.equal(notice.requests.find(r => r.quote.startsWith('☑')).line, 8);
});

test('checkbox selection is explicit and unmarked boilerplate is not evidence', () => {
  const notice = analyzeNotice(`CalFresh\nCF377.6\nPlease return requested items by October 24, 2026.\n[ ] Proof of income\n☐ Proof of identity\n■ Pay stubs\n□ Proof of residency\nProof of citizenship\nFor example, you can provide a passport.\n[X] Proof of rent\n☒ Income statement`, options);
  assert.deepEqual(notice.requests.filter(r => r.kind === 'document').map(r => r.quote), ['[X] Proof of rent', '☒ Income statement']);
  assert.ok(notice.warnings.some(w => /checkbox/i.test(w)));
});

test('definite requested section accepts its bullets but not unselected options', () => {
  const notice = analyzeNotice(`CalFresh CF377.6\nRequested items:\n- Pay stubs for September 2026\n[ ] Proof of rent\n\nImportant rules\n- A birth certificate may be accepted.`, options);
  assert.equal(notice.requests.length, 1);
  assert.match(notice.requests[0].quote, /Pay stubs/);
});

test('selected evidence can include examples of acceptable alternatives', () => {
  const notice = analyzeNotice('CalFresh CF377.6\n[X] Proof of rent, such as a rental agreement or rent receipt\nFor example, you can provide a passport.\nPlease provide proof of rent showing the housing cost you reported. If you cannot get it, ask the county for help.', options);
  assert.equal(notice.requests.length, 2);
  assert.ok(notice.requests.some(r => r.quote.startsWith('[X] Proof of rent')));
  assert.ok(notice.requests.some(r => r.quote.startsWith('Please provide')));
  assert.ok(!notice.requests.some(r => r.quote.startsWith('For example')));
  assertAnchors(notice);
});

test('CF377.2B and another unknown form abstain rather than borrowing the .2 adapter', () => {
  for (const code of ['CF377.2B', 'CF377.4', 'CF377.11']) {
    const notice = analyzeNotice(`CalFresh ${code}\nSubmit your renewal form by October 22, 2026.`, options);
    assert.equal(notice.supported, false);
    assert.equal(notice.type, 'unknown');
    assert.equal(notice.requests.length, 0);
    assert.equal(notice.deadlines.length, 0);
  }
});

test('two forms in one input abstain and advise separate notices', () => {
  const notice = analyzeNotice(`${renewal}\nCF377.6\n${verification}`, options);
  assert.equal(notice.supported, false);
  assert.equal(notice.deadlines.length, 0);
  assert.ok(notice.warnings.some(w => /Multiple form codes/.test(w)));
});

test('a clearly labeled CalFresh interview works without a printed form number', () => {
  const notice = analyzeNotice(`County of San Mateo\nCalFresh Interview Appointment\nYour interview is scheduled for November 3, 2026 at 9:30 AM.`, options);
  assert.equal(notice.type, 'interview');
  assert.equal(notice.supported, true);
  assert.equal(notice.county, 'san-mateo');
  assert.equal(notice.deadlines[0].date, '2026-11-03');
  assert.equal(notice.requests[0].kind, 'interview');
});

test('general interview guidance is not a scheduled appointment', () => {
  const notice = analyzeNotice('CalFresh applicants must complete an interview. Call to schedule one.', options);
  assert.equal(notice.supported, false);
  assert.equal(notice.deadlines.length, 0);
});

test('a printed unsupported form never adopts the unnumbered interview adapter', () => {
  const notice = analyzeNotice('CalFresh CF386\nYour interview is scheduled for October 20, 2026.', options);
  assert.equal(notice.formCode, 'CF386');
  assert.equal(notice.supported, false);
  assert.equal(notice.deadlines.length, 0);
});

test('missing years, two-digit years, and invalid calendar dates need review without guessed dates', () => {
  for (const raw of ['October 24', 'October 24, 26', '10/24/26', 'February 30, 2026', '2026-02-29', '13/24/2026']) {
    const notice = analyzeNotice(`CalFresh CF377.6\nPlease provide proof of rent by ${raw}.`, options);
    assert.equal(notice.deadlines.length, 1, raw);
    assert.equal(notice.deadlines[0].date, null, raw);
    assert.equal(notice.deadlines[0].needsReview, true, raw);
    assert.equal(notice.deadlines[0].confirmed, false);
  }
});

test('unambiguous dates and leap years parse; numeric month/day ambiguity is flagged', () => {
  for (const [raw, date, needsReview] of [['10/24/2026', '2026-10-24', false], ['2028-02-29', '2028-02-29', false], ['Oct. 24, 2026', '2026-10-24', false], ['10/11/2026', '2026-10-11', true]]) {
    const notice = analyzeNotice(`CalFresh CF377.6\nPlease return proof of income by ${raw}.`, options);
    assert.equal(notice.deadlines[0].date, date, raw);
    assert.equal(notice.deadlines[0].needsReview, needsReview, raw);
  }
});

test('a date at the start of the next line anchors the instruction and the date', () => {
  const notice = analyzeNotice('CalFresh CF377.6\nPlease return proof of rent by\nOctober 24, 2026.', options);
  assert.equal(notice.deadlines[0].date, '2026-10-24');
  assert.equal(notice.deadlines[0].line, 2);
  assert.ok(notice.deadlines[0].quote.includes('\n'));
  assertAnchors(notice);
});

test('notice date is never converted to a submission deadline', () => {
  const notice = analyzeNotice('CalFresh CF377.6\nNotice Date: October 9, 2026\n[X] Pay stubs', options);
  assert.equal(notice.noticeDate, '2026-10-09');
  assert.equal(notice.deadlines.length, 0);
  assert.ok(notice.warnings.some(w => /No explicit/.test(w)));
});

test('relative deadline produces a review item, never an inferred date', () => {
  const notice = analyzeNotice('CalFresh CF377.2\nYou must file an application no later than the 15th day of the last month of the certification period.\nYour certification period will end on October 31, 2026.', options);
  assert.equal(notice.deadlines.find(d => d.kind === 'submit').date, null);
  assert.equal(notice.deadlines.find(d => d.kind === 'submit').needsReview, true);
  assert.equal(notice.deadlines.find(d => d.kind === 'end').date, '2026-10-31');
});

test('renewal adapter preserves conditional intent and wrapped relative filing rules', () => {
  const text = 'County of Santa Clara\nCalFresh CF377.2\nNotice Date: October 9, 2026\nYour certification ends on October 31, 2026.\n2. If you want to renew your benefits, you must file an application no later than the 15th\nday of the final certification month. Complete the interview with the county.\nProvide any evidence requested by your worker.\n3. You will get a separate appointment letter.\n[ ] Proof of identity\n[ ] Proof of citizenship';
  const notice = analyzeNotice(text, options);
  assert.equal(notice.requests.filter(request => request.kind === 'form').length, 1);
  assert.match(notice.requests[0].title, /^To renew/);
  assert.equal(notice.requests.filter(request => request.kind === 'document').length, 0);
  const filing = notice.deadlines.find(deadline => deadline.kind === 'submit');
  assert.equal(filing.date, null);
  assert.equal(filing.needsReview, true);
  assert.ok(filing.quote.includes('\n'));
  assert.equal(notice.deadlines.find(deadline => deadline.kind === 'end').date, '2026-10-31');
  assert.ok(notice.warnings.some(warning => /not calculated/.test(warning)));
  assertAnchors(notice);
});

test('renewal adapter accepts a stated absolute filing date without assuming it from the end date', () => {
  const notice = analyzeNotice('CalFresh CF377.2\nIf you wish to keep getting benefits, you must file an application by October 15, 2026.\nYour certification ends on October 31, 2026.', options);
  assert.equal(notice.deadlines.find(deadline => deadline.kind === 'submit').date, '2026-10-15');
  assert.equal(notice.deadlines.find(deadline => deadline.kind === 'end').date, '2026-10-31');
  assert.ok(notice.deadlines.every(deadline => deadline.confirmed === false));
});

test('different dates for a single kind are preserved and flagged, never selected silently', () => {
  const notice = analyzeNotice('CalFresh CF377.6\nPlease return proof of rent by October 23, 2026.\nPlease provide proof of income by October 26, 2026.', options);
  assert.equal(notice.deadlines.length, 2);
  assert.ok(notice.deadlines.every(d => d.needsReview));
  assert.ok(notice.warnings.some(w => /Different submit dates/.test(w)));
});

test('different date kinds on the same line keep their own contexts', () => {
  const notice = analyzeNotice('CalFresh CF377.2\nSubmit your renewal form by October 22, 2026. Your certification ends on October 31, 2026.', options);
  assert.deepEqual(notice.deadlines.map(d => [d.kind, d.date]), [['submit', '2026-10-22'], ['end', '2026-10-31']]);
});

test('conditional examples and negated instructions do not become requested evidence', () => {
  const notice = analyzeNotice('CalFresh CF377.6\nIf asked, please provide a passport by October 24, 2026.\nDo not send proof of citizenship.\nYou may provide a birth certificate.', options);
  assert.equal(notice.requests.length, 0);
  assert.equal(notice.deadlines.length, 0);
});

test('empty, non-string, and image-like unsupported text fail closed without throwing', () => {
  for (const value of ['', null, undefined, {}, 'Unreadable scanned document ▯ ▯ ▯']) {
    const notice = analyzeNotice(value, options);
    assert.equal(notice.supported, false);
    assert.equal(notice.deadlines.length, 0);
    assert.ok(notice.warnings.length > 0);
  }
});

test('county is grounded in source; conflicting counties are not resolved by options', () => {
  assert.equal(analyzeNotice('CalFresh CF377.6\nCounty of San Mateo', { ...options, county: 'santa-clara' }).county, 'san-mateo');
  const both = analyzeNotice('CalFresh CF377.6\nSanta Clara\nSan Mateo', { ...options, county: 'santa-clara' });
  assert.equal(both.county, 'unknown');
  assert.ok(both.warnings.some(w => /More than one county/.test(w)));
});

test('reconciliation identifies possible same-family conflict and exact duplicate evidence without mutation', () => {
  const first = analyzeNotice(verification, { ...options, id: 'first' });
  const second = analyzeNotice(verification.replace('October 24', 'October 26'), { ...options, id: 'second' });
  const before = JSON.stringify([first, second]);
  const findings = reconcileNotices([first, second]);
  assert.ok(findings.some(f => f.kind === 'deadline-conflict'));
  assert.ok(findings.some(f => f.kind === 'duplicate-request'));
  assert.ok(findings.every(f => f.noticeIds.join(',') === 'first,second'));
  assert.equal(JSON.stringify([first, second]), before);
  assert.ok(findings.some(f => /neither notice has been marked as replaced/.test(f.description)));
});

test('reconciliation does not call unrelated counties or different notice families deadline conflicts', () => {
  const first = analyzeNotice(verification, { ...options, id: 'first' });
  const second = analyzeNotice(verification.replaceAll('Santa Clara', 'San Mateo').replace('October 24', 'October 26'), { ...options, id: 'second' });
  assert.equal(reconcileNotices([first, second]).length, 0);
  const third = analyzeNotice(renewal, { ...options, id: 'third' });
  assert.ok(!reconcileNotices([first, third]).some(f => f.kind === 'deadline-conflict'));
});

test('date display is locale-aware and validates impossible dates', () => {
  assert.equal(formatDate('2026-10-24'), 'October 24, 2026');
  assert.match(formatDate('2026-10-24', 'es'), /octubre/);
  assert.equal(formatDate('2026-02-30'), 'Date needs review');
  assert.equal(formatDate(null), 'Date needs review');
});

test('calendar day differences use Los Angeles and remain correct across daylight saving', () => {
  assert.equal(daysUntil('2026-10-10', '2026-10-09'), 1);
  assert.equal(daysUntil('2026-10-09', '2026-10-09'), 0);
  assert.equal(daysUntil('2026-10-08', '2026-10-09'), -1);
  assert.equal(daysUntil('2026-10-10', '2026-10-10T02:00:00Z'), 1);
  assert.equal(daysUntil('2026-11-02', '2026-10-31'), 2);
  assert.equal(daysUntil('2026-02-30', '2026-10-09'), null);
  assert.equal(daysUntil('2026-10-10', 'invalid'), null);
});

test('calendar includes only dates explicitly confirmed by user and preserves all-day date boundaries', () => {
  const notice = analyzeNotice(renewal, options);
  assert.equal((createCalendar(notice).match(/BEGIN:VEVENT/g) || []).length, 0);
  notice.deadlines.find(d => d.kind === 'submit').confirmed = true;
  const calendar = createCalendar(notice);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(calendar, /DTSTART;VALUE=DATE:20261022/);
  assert.match(calendar, /DTEND;VALUE=DATE:20261023/);
  assert.ok(!calendar.includes('DTSTART;VALUE=DATE:20261020'));
  assert.ok(!calendar.includes('DTSTART;VALUE=DATE:20261031'));
  assert.match(calendar, /BEGIN:VCALENDAR/);
});

test('calendar rejects invalid/null dates even if a stored confirmation flag is true', () => {
  const notice = analyzeNotice(verification, options);
  notice.deadlines = [{ id: 'bad', date: '2026-02-30', confirmed: true }, { id: 'unknown', date: null, confirmed: true }];
  assert.ok(!createCalendar(notice).includes('BEGIN:VEVENT'));
});

test('calendar omits dates explicitly excluded after resident clarification without erasing source evidence', () => {
  const notice = analyzeNotice('CalFresh CF377.6\nSubmit the requested items by October 23, 2026.\nSubmit the requested items by October 26, 2026.', options);
  notice.clarification = 'Resident recorded that the earlier date does not apply after checking with the county.';
  notice.deadlines.forEach(deadline => { deadline.confirmed = true; });
  notice.deadlines[0].excluded = true;
  const before = JSON.stringify(notice);
  const calendar = createCalendar(notice);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(!calendar.includes('DTSTART;VALUE=DATE:20261023'));
  assert.ok(calendar.includes('DTSTART;VALUE=DATE:20261026'));
  assert.equal(JSON.stringify(notice), before);
  assertAnchors(notice);
});

test('calendar escapes untrusted text and folds UTF-8 lines without calendar injection', () => {
  const notice = analyzeNotice(verification, options);
  notice.filename = 'a,b;evil\r\nBEGIN:VEVENT';
  notice.deadlines[0].confirmed = true;
  notice.deadlines[0].quote = `${'é'.repeat(100)}\nEND:VCALENDAR`;
  const calendar = createCalendar(notice);
  assert.equal((calendar.match(/^BEGIN:VEVENT$/gm) || []).length, 1);
  assert.equal((calendar.match(/^END:VCALENDAR\r?$/gm) || []).length, 1);
  assert.ok(calendar.includes('a\\,b\\;evil\\nBEGIN:VEVENT'));
  for (const line of calendar.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
});
