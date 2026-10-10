/**
 * A deterministic continuity graph, built from the resident's reviewed facts.
 *
 * This module has no storage, network or UI side effects. Its clock is injectable.
 * A completed
 * preparation task never implies submission; a saved file never implies agency
 * acceptance. Calendar facts are kept separate from workflow dependencies.
 */

export type Stage = 'review' | 'prepare' | 'submit' | 'proof' | 'followup';
export type NodeState = 'complete' | 'ready' | 'blocked';
export type ReasonCode =
  | 'unsupported'
  | 'review-unchecked'
  | 'deadline-unverified'
  | 'deadline-missing'
  | 'deadline-conflict'
  | 'no-request'
  | 'preparation-pending'
  | 'submission-missing'
  | 'proof-missing'
  | 'acknowledgement-missing';

export interface SourceFact {
  id: string;
  quote?: string;
  line?: number;
  start?: number;
  end?: number;
}
export interface NoticeDeadline extends SourceFact {
  kind: string;
  label?: string;
  date: string | null;
  raw?: string;
  confirmed?: boolean;
  excluded?: boolean;
  needsReview?: boolean;
}
export interface NoticeRequest extends SourceFact {
  title: string;
  kind: string;
  status: string;
}
export interface ContinuityNotice {
  id: string;
  title: string;
  filename?: string;
  supported: boolean;
  reviewed?: boolean;
  program?: string;
  county?: string;
  type?: string;
  sourceText?: string;
  clarification?: string;
  deadlines: NoticeDeadline[];
  requests: NoticeRequest[];
}
/** Additional ledger events extend the existing submitted/prepared event model. */
export interface LedgerEvent {
  id: string;
  kind: string;
  noticeId?: string;
  date: string;
  title?: string;
  detail?: string;
  attachmentId?: string | null;
  submissionEventId?: string;
  requestId?: string;
  sourceNoticeId?: string;
  sourceRequestId?: string;
}
export interface ContinuityWorkspace {
  notices: ContinuityNotice[];
  events: LedgerEvent[];
}
export interface Blocker {
  code: ReasonCode;
  noticeId: string;
  factId?: string;
  line?: number;
}
export interface WorkflowNode {
  id: string;
  noticeId: string;
  requestId?: string;
  stage: Stage;
  title: string;
  dependencies: string[];
  state: NodeState;
  reasons: Blocker[];
  /** A suggested focus block, not an estimate of how long completion takes. */
  timeboxMinutes: number;
  due: string | null;
  line?: number;
}
export interface NoticeLane {
  notice: ContinuityNotice;
  nodes: WorkflowNode[];
  blockers: Blocker[];
  latestSubmission: LedgerEvent | null;
  acknowledgement: LedgerEvent | null;
  prepared: number;
  requested: number;
}
export interface TimelineFact {
  noticeId: string;
  noticeTitle: string;
  deadline: NoticeDeadline;
  date: string;
  days: number | null;
  /** End dates describe the notice; they are never reused as filing dates. */
  contextOnly: boolean;
}
export interface Comparison {
  kind: 'different-dates' | 'duplicate-notice';
  noticeIds: string[];
  dates?: string[];
  deadlineKind?: string;
}
export interface EvidenceCandidate {
  id: string;
  sourceNotice: ContinuityNotice;
  sourceRequest: NoticeRequest;
  targetNotice: ContinuityNotice;
  targetRequest: NoticeRequest;
  chosen: boolean;
}
export interface ContinuityAssessment {
  today: string | null;
  capacityMinutes: number;
  nodes: WorkflowNode[];
  lanes: NoticeLane[];
  ready: WorkflowNode[];
  session: WorkflowNode[];
  allocatedMinutes: number;
  blocked: WorkflowNode[];
  timeline: TimelineFact[];
  unverifiedDates: number;
  comparisons: Comparison[];
  evidenceCandidates: EvidenceCandidate[];
}
export interface AssessmentOptions {
  today?: string | Date;
  capacityMinutes?: number;
}

const DAY = 86_400_000;
const nodeKey = (noticeId: string, stage: Stage, requestId?: string): string =>
  `${encodeURIComponent(noticeId)}:${stage}${requestId ? `:${encodeURIComponent(requestId)}` : ''}`;

/** Reject impossible dates rather than letting Date silently roll into a month. */
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2199) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** The service region's date is stable across DST and users' device time zones. */
function regionDay(value?: string | Date): string | null {
  if (validDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  const result = `${part('year')}-${part('month')}-${part('day')}`;
  return validDate(result) ? result : null;
}

function eventDay(event: LedgerEvent): string | null {
  const date = String(event.date ?? '').slice(0, 10);
  return validDate(date) ? date : null;
}
function activeDates(notice: ContinuityNotice): NoticeDeadline[] {
  return (notice.deadlines ?? []).filter((deadline) => deadline.excluded !== true);
}
function checkedDates(notice: ContinuityNotice): NoticeDeadline[] {
  return notice.supported
    ? activeDates(notice).filter(
        (deadline) => deadline.confirmed === true && validDate(deadline.date),
      )
    : [];
}
function dueFor(notice: ContinuityNotice, kind: string): string | null {
  return (
    checkedDates(notice)
      .filter((deadline) => deadline.kind === kind)
      .map((deadline) => deadline.date as string)
      .sort()[0] ?? null
  );
}
function reason(code: ReasonCode, noticeId: string, fact?: SourceFact): Blocker {
  return { code, noticeId, ...(fact ? { factId: fact.id, line: fact.line } : {}) };
}

/** Match the original plan gate: a review must resolve every applicable date. */
function reviewBlockers(notice: ContinuityNotice): Blocker[] {
  if (!notice.supported) return [reason('unsupported', notice.id)];
  const blockers: Blocker[] = [];
  if (!notice.reviewed) blockers.push(reason('review-unchecked', notice.id));
  const deadlines = activeDates(notice);
  if (!deadlines.some((deadline) => deadline.confirmed === true && validDate(deadline.date))) {
    blockers.push(reason('deadline-missing', notice.id));
  }
  for (const deadline of deadlines) {
    if (deadline.confirmed !== true || !validDate(deadline.date)) {
      blockers.push(reason('deadline-unverified', notice.id, deadline));
    }
  }
  for (const kind of ['submit', 'interview', 'end']) {
    const values = new Set(
      deadlines
        .filter((deadline) => deadline.kind === kind && validDate(deadline.date))
        .map((deadline) => deadline.date),
    );
    if (values.size > 1 && !notice.clarification?.trim()) {
      blockers.push(reason('deadline-conflict', notice.id));
      break;
    }
  }
  return blockers;
}

function sameKnownCaseRegion(first: ContinuityNotice, second: ContinuityNotice): boolean {
  return Boolean(
    first.supported &&
    second.supported &&
    first.program &&
    first.program === second.program &&
    first.county &&
    first.county !== 'unknown' &&
    first.county === second.county,
  );
}
function requestWording(request: NoticeRequest): string {
  return String(request.quote ?? '')
    .toLowerCase()
    .replace(/^(?:\[[xX✓✔]\]|☑|☒)\s*/u, '')
    .replace(/^\s*[•*\-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same wording is a prompt to compare originals, never a merged requirement. */
function compareNotices(notices: ContinuityNotice[]): Comparison[] {
  const findings: Comparison[] = [];
  for (let i = 0; i < notices.length; i++) {
    for (let j = i + 1; j < notices.length; j++) {
      const first = notices[i],
        second = notices[j];
      if (!sameKnownCaseRegion(first, second)) continue;
      if (first.sourceText?.trim() && first.sourceText.trim() === second.sourceText?.trim()) {
        findings.push({ kind: 'duplicate-notice', noticeIds: [first.id, second.id] });
        continue;
      }
      if (first.type !== second.type) continue;
      for (const kind of ['submit', 'interview', 'end']) {
        const a = [
          ...new Set(
            activeDates(first)
              .filter((d) => d.kind === kind && validDate(d.date))
              .map((d) => d.date as string),
          ),
        ].sort();
        const b = [
          ...new Set(
            activeDates(second)
              .filter((d) => d.kind === kind && validDate(d.date))
              .map((d) => d.date as string),
          ),
        ].sort();
        if (a.length && b.length && a.join(',') !== b.join(',')) {
          findings.push({
            kind: 'different-dates',
            noticeIds: [first.id, second.id],
            dates: [...new Set([...a, ...b])].sort(),
            deadlineKind: kind,
          });
        }
      }
    }
  }
  return findings;
}

function evidenceMatches(notices: ContinuityNotice[], events: LedgerEvent[]): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];
  type RequestReference = { notice: ContinuityNotice; request: NoticeRequest };
  const groups = new Map<string, RequestReference[]>();
  // Index exact wording once. Comparing every request with every other request
  // would spend quadratic work on unrelated documents in a large workspace.
  for (const notice of notices) {
    if (!notice.supported || !notice.program || !notice.county || notice.county === 'unknown')
      continue;
    for (const request of notice.requests ?? []) {
      if (request.kind !== 'document') continue;
      const wording = requestWording(request);
      if (!wording) continue;
      const key = JSON.stringify([notice.program, notice.county, wording]);
      const group = groups.get(key) ?? [];
      group.push({ notice, request });
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) {
    const preparedItems = group.filter((item) => item.request.status === 'done');
    const pendingItems = group.filter((item) => item.request.status !== 'done');
    for (const source of preparedItems) {
      for (const target of pendingItems) {
        if (source.notice.id === target.notice.id) continue;
        const chosen = events.some(
          (event) =>
            event.kind === 'evidence-reused' &&
            event.noticeId === target.notice.id &&
            event.requestId === target.request.id &&
            event.sourceNoticeId === source.notice.id &&
            event.sourceRequestId === source.request.id &&
            Boolean(event.detail?.trim()) &&
            Boolean(eventDay(event)),
        );
        candidates.push({
          id: `${nodeKey(source.notice.id, 'prepare', source.request.id)}>${nodeKey(target.notice.id, 'prepare', target.request.id)}`,
          sourceNotice: source.notice,
          sourceRequest: source.request,
          targetNotice: target.notice,
          targetRequest: target.request,
          chosen,
        });
      }
    }
  }
  return candidates;
}

/**
 * Build a DAG, then choose currently actionable focus blocks within capacity.
 * The scenario is read-only: no inferred completion or future agency response.
 */
export function assessContinuity(
  workspace: ContinuityWorkspace,
  options: AssessmentOptions = {},
): ContinuityAssessment {
  const today = regionDay(options.today);
  const capacityMinutes = [15, 30, 60].includes(options.capacityMinutes ?? 30)
    ? (options.capacityMinutes ?? 30)
    : 30;
  const notices = Array.isArray(workspace?.notices) ? workspace.notices : [];
  const events = Array.isArray(workspace?.events) ? workspace.events : [];
  const nodes: WorkflowNode[] = [];
  const nodesById = new Map<string, WorkflowNode>();
  const lanes: NoticeLane[] = [];
  const timeline: TimelineFact[] = [];
  let unverifiedDates = 0;

  for (const notice of notices) {
    const laneNodes: WorkflowNode[] = [];
    const blockers = reviewBlockers(notice);
    const reviewId = nodeKey(notice.id, 'review');
    const create = (
      stage: Stage,
      title: string,
      dependencies: string[],
      complete: boolean,
      reasons: Blocker[],
      minutes: number,
      request?: NoticeRequest,
    ): WorkflowNode => {
      const node: WorkflowNode = {
        id: nodeKey(notice.id, stage, request?.id),
        noticeId: notice.id,
        stage,
        title,
        dependencies,
        state: complete
          ? 'complete'
          : reasons.length || dependencies.some((id) => nodesById.get(id)?.state !== 'complete')
            ? 'blocked'
            : 'ready',
        reasons,
        timeboxMinutes: minutes,
        due: dueFor(notice, request?.kind === 'interview' ? 'interview' : 'submit'),
        ...(request ? { requestId: request.id, line: request.line } : {}),
      };
      nodes.push(node);
      nodesById.set(node.id, node);
      laneNodes.push(node);
      return node;
    };
    // Review findings tell the user what to resolve; they do not prevent opening
    // the original. Unsupported documents stay in the human-review queue.
    create(
      'review',
      notice.title,
      [],
      blockers.length === 0,
      notice.supported ? [] : [reason('unsupported', notice.id)],
      5,
    );
    for (const request of notice.requests ?? []) {
      create(
        'prepare',
        request.title,
        [reviewId],
        request.status === 'done',
        blockers.length ? blockers : [],
        request.kind === 'form' || request.kind === 'document' ? 15 : 10,
        request,
      );
    }

    const submissions = events
      .filter(
        (event) => event.kind === 'submitted' && event.noticeId === notice.id && eventDay(event),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const latestSubmission = submissions[0] ?? null;
    // An acknowledgement of an earlier upload cannot close a later upload.
    const acknowledgement = latestSubmission
      ? (events
          .filter(
            (event) =>
              event.kind === 'acknowledged' &&
              event.noticeId === notice.id &&
              event.submissionEventId === latestSubmission.id &&
              event.detail?.trim() &&
              eventDay(event) &&
              (eventDay(event) as string) >= (eventDay(latestSubmission) as string),
          )
          .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null)
      : null;
    const paperRequests = (notice.requests ?? []).filter((request) => request.kind !== 'interview');
    const prepareIds = paperRequests.map((request) => nodeKey(notice.id, 'prepare', request.id));
    const pending = paperRequests.filter((request) => request.status !== 'done');
    const submissionReasons = [
      ...blockers,
      ...(!paperRequests.length ? [reason('no-request', notice.id)] : []),
      ...pending.map((request) => reason('preparation-pending', notice.id, request)),
    ];
    const submit = create(
      'submit',
      notice.title,
      [reviewId, ...prepareIds],
      Boolean(latestSubmission),
      submissionReasons,
      5,
    );
    const proof =
      Boolean(latestSubmission?.attachmentId) ||
      Boolean(
        latestSubmission &&
        events.some(
          (event) =>
            event.kind === 'receipt' &&
            event.noticeId === notice.id &&
            event.submissionEventId === latestSubmission.id &&
            event.attachmentId &&
            eventDay(event),
        ),
      );
    create(
      'proof',
      notice.title,
      [submit.id],
      proof,
      !latestSubmission ? [reason('submission-missing', notice.id)] : [],
      5,
    );
    create(
      'followup',
      notice.title,
      [submit.id],
      Boolean(acknowledgement),
      !latestSubmission ? [reason('submission-missing', notice.id)] : [],
      5,
    );
    lanes.push({
      notice,
      nodes: laneNodes,
      blockers,
      latestSubmission,
      acknowledgement,
      prepared: (notice.requests ?? []).filter((request) => request.status === 'done').length,
      requested: (notice.requests ?? []).length,
    });

    for (const deadline of activeDates(notice)) {
      if (notice.supported && deadline.confirmed === true && validDate(deadline.date)) {
        timeline.push({
          noticeId: notice.id,
          noticeTitle: notice.title,
          deadline,
          date: deadline.date,
          days: today
            ? Math.round(
                (Date.parse(`${deadline.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY,
              )
            : null,
          contextOnly: deadline.kind === 'end',
        });
      } else {
        unverifiedDates++;
      }
    }
  }

  // Confirmed action dates come first, then review tasks, then stable IDs. End
  // dates do not create or reorder submission deadlines. No risk score exists.
  const stageOrder: Record<Stage, number> = {
    review: 0,
    prepare: 1,
    submit: 2,
    proof: 3,
    followup: 4,
  };
  const ready = nodes
    .filter((node) => node.state === 'ready')
    .sort(
      (a, b) =>
        (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31') ||
        stageOrder[a.stage] - stageOrder[b.stage] ||
        a.id.localeCompare(b.id),
    );
  const session: WorkflowNode[] = [];
  let allocatedMinutes = 0;
  for (const node of ready) {
    if (allocatedMinutes + node.timeboxMinutes <= capacityMinutes) {
      session.push(node);
      allocatedMinutes += node.timeboxMinutes;
    }
  }
  timeline.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.noticeId.localeCompare(b.noticeId) ||
      a.deadline.id.localeCompare(b.deadline.id),
  );
  return {
    today,
    capacityMinutes,
    nodes,
    lanes,
    ready,
    session,
    allocatedMinutes,
    blocked: nodes.filter((node) => node.state === 'blocked'),
    timeline,
    unverifiedDates,
    comparisons: compareNotices(notices),
    evidenceCandidates: evidenceMatches(notices, events),
  };
}
