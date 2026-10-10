# Anchor's continuity workspace

The continuity workspace connects notice review, preparation, submission records,
confirmation files, and a resident's record of an agency response. This adds a
reasoning layer beyond extracting a date and making a checklist. It does not
estimate eligibility, produce a risk score, calculate legal dates, or decide
whether benefits continue.

## Organization

- `src/domain/continuity.ts`: typed notice/ledger contracts and a pure dependency
  graph. No network calls, storage mutations, or UI decisions belong here.
- `src/ui/continuity-view.ts`: escaped, bilingual presentation of that graph.
  Event delegation remains in the application controller.
- `web/continuity.css`: scoped, responsive styles that use Anchor's existing
  cream and teal design. State has text labels as well as color.
- `tests/continuity.test.mjs`: exercises the TypeScript source through esbuild
  using the actual notice adapter and fictional practice notices.

TypeScript is useful here because dependencies, deadlines, ledger records, and
source references have different meanings. The interfaces make those boundaries
explicit. The browser receives ordinary compiled JavaScript.

## Dependency graph

A notice produces a review node, preparation nodes for each explicit request,
a submission-record node, a confirmation-file node, and a response-record node.
Edges point to earlier nodes, so the result is a directed acyclic graph.

Review is complete only when the resident reviewed the supported notice and
checked every applicable date. At least one applicable calendar date must have
been checked, matching the existing plan's readiness rule. Conflicting dates
within a notice require a recorded clarification; excluded dates remain in the
original record but leave the active timeline.

Each preparation node depends on review. Paperwork submission planning depends
on those preparation nodes. An interview is a separate appointment step; it is
not inserted as a prerequisite to sending requested paperwork.

A historical submission record is preserved even if the current checklist is
unfinished. This lets the graph represent reality rather than erase an upload
that the resident says they made. Recording a submission is distinct from proving
delivery. A linked confirmation file is distinct from recording a response.
Neither proves approval, eligibility, or continuing benefits.

## Ledger contract

Existing `submitted` events remain compatible. A new response record is:

```ts
{
  id: string,
  kind: 'acknowledged',
  noticeId: string,
  submissionEventId: string,
  date: string,
  title: string,
  detail: string
}
```

The graph recognizes it only if it refers to the latest valid submission for that
notice, includes a nonempty resident note, and has a valid date on or after the
submission date. A response to an earlier upload does not close a later upload.
This is a resident-recorded statement, not an independently authenticated agency
message. An attached file alone never creates a response record.

An explicit evidence-reuse comparison can be recorded as:

```ts
{
  id: string,
  kind: 'evidence-reused',
  noticeId: string,
  requestId: string,
  sourceNoticeId: string,
  sourceRequestId: string,
  date: string,
  detail: string
}
```

This choice is advisory. It never changes a target request's preparation status,
marks a submission complete, moves a file, or declares agency acceptance. The
resident must compare the person, requested period, and each letter's submission
instructions, then separately mark preparation if appropriate.

## Explainable next-step ordering

The queue contains only nodes whose dependencies are recorded as complete.
It orders by the earliest resident-checked submission/interview date, followed
by workflow stage and a stable node identifier. Unchecked dates are excluded
from the confirmed timeline. A certification end date is shown as context and
never reused as a filing date or used to invent a deadline.

The 15/30/60-minute control allocates suggested focus blocks. Five minutes can
be reserved for reviewing a letter or organizing a follow-up question; 15 minutes
can be reserved for starting a document/form task. These are planning timeboxes,
not evidence-based duration predictions or promises of completing the task.
Only currently ready nodes are offered; the planner does not assume that working
on an earlier task will complete it during the session.

Changing capacity mutates no records. The waiting comparison shows the current
unfinished workflow; it does not predict benefit loss or an agency's response.
The resident can change capacity freely and independently record actual work.

## Multiple letters

Date differences are advisory when supported notices have the same program,
known county, and notice family. They may concern different cases or steps. Both
originals remain visible; no notice silently replaces another. Exact duplicate
notice text is flagged without deleting either record.

Reuse suggestions require a prepared document request and identical normalized
source wording on an unfinished request in another supported letter with the
same program and known county. Different months or people in the source wording
do not match. Unknown or different counties produce no reuse suggestion. The
graph does not claim identical wording proves that a document will be accepted.

## Verification boundaries

Tests cover dependency gates, impossible dates, DST-safe service-region days,
separate interview dates, excluded/unverified facts, later submissions,
foreign/empty/early response records, exact duplicate notices, reuse without
automatic completion, reversible capacity, unsupported documents, and HTML
escaping. No tests substitute a mock agency decision for a real government fact.
