/**
 * Calendar candidates come only from dates a resident has checked. This module
 * shares the notice adapter's supported/confirmed/excluded/date gates, then
 * rejects conflicting and unchecked options before a preview can be shown.
 * Calendar descriptions deliberately contain no notice text or account data.
 */
import { validDate, type NoticeDeadline, type NoticeRequest } from './continuity.js';

export type CalendarKind = 'submit' | 'interview' | 'end';
export interface CalendarDeadline extends NoticeDeadline {
  originalDate?: string | null;
  requestId?: string;
  selected?: boolean;
  checked?: boolean;
}
export interface CalendarRequest extends NoticeRequest {
  selected?: boolean;
  checked?: boolean;
  excluded?: boolean;
}
export interface CalendarNotice {
  id: string;
  supported: boolean;
  clarification?: string;
  deadlines?: CalendarDeadline[];
  requests?: CalendarRequest[];
}
export interface CalendarCandidate {
  key: string;
  noticeId: string;
  deadlineId: string;
  kind: CalendarKind;
  date: string;
  endDate: string;
  summary: string;
  description: string;
  /** Period-end context is never repurposed as a filing deadline. */
  contextOnly: boolean;
}
export interface CalendarEventPayload {
  id: string;
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  visibility: 'private';
  transparency: 'transparent';
  reminders: { useDefault: true };
}
export interface CalendarEventIdentity {
  /** Stable opaque account/guest identifier; hashed rather than sent to Google. */
  namespace: string;
  mode: 'personal' | 'demo';
}

const uncheckedOption = /^\s*(?:\[\s*\]|☐|\[\?\]|[■□▣▪◼◻])/mu;
const kinds: CalendarKind[] = ['submit', 'interview', 'end'];

function definiteRequest(request: CalendarRequest): boolean {
  return (
    request.excluded !== true &&
    request.selected !== false &&
    request.checked !== false &&
    !uncheckedOption.test(request.quote || request.title || '')
  );
}

/** Google all-day event end dates are exclusive, including year and leap-day boundaries. */
export function nextCalendarDay(date: string): string {
  if (!validDate(date)) throw new TypeError('Check this date in the original notice first.');
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function getCalendarCandidates(
  notices: readonly CalendarNotice[] = [],
  lang = 'en',
): CalendarCandidate[] {
  const es = lang === 'es';
  const candidates: CalendarCandidate[] = [];
  const seen = new Set<string>();
  for (const notice of notices) {
    if (!notice?.supported || !notice.id) continue;
    const deadlines = notice.deadlines || [];
    const requests = (notice.requests || []).filter(definiteRequest);
    for (const deadline of deadlines) {
      if (
        !kinds.includes(deadline.kind as CalendarKind) ||
        deadline.confirmed !== true ||
        deadline.excluded === true ||
        deadline.selected === false ||
        deadline.checked === false ||
        uncheckedOption.test(deadline.quote || '') ||
        !validDate(deadline.date)
      )
        continue;
      const kind = deadline.kind as CalendarKind;
      // Keep original competing dates visible until a resident records the
      // clarification, even if one was edited or excluded in the current plan.
      const originalDates = new Set(
        deadlines
          .filter((item) => item.kind === kind)
          .map((item) => item.originalDate || item.date)
          .filter(validDate),
      );
      if (originalDates.size > 1 && !notice.clarification?.trim()) continue;
      if (deadline.requestId && !requests.some((request) => request.id === deadline.requestId))
        continue;
      if (
        kind !== 'end' &&
        !requests.some((request) =>
          kind === 'interview'
            ? request.kind === 'interview'
            : ['form', 'document', 'submit', 'renewal', 'application', 'verification'].includes(
                request.kind,
              ),
        )
      )
        continue;
      const key = JSON.stringify([notice.id, kind, deadline.date]);
      if (seen.has(key)) continue;
      seen.add(key);
      const summary =
        kind === 'interview'
          ? es
            ? 'Anchor: Recordatorio de cita'
            : 'Anchor: Appointment reminder'
          : kind === 'end'
            ? es
              ? 'Anchor: Revisar el fin de un período'
              : 'Anchor: Review a period end date'
            : es
              ? 'Anchor: Revisar los elementos solicitados'
              : 'Anchor: Check requested items';
      const description = es
        ? `Fecha verificada por ti en Anchor. Recordatorio de todo el día: consulta el aviso original para ver la hora y las instrucciones actuales. ${kind === 'end' ? 'Esta fecha es información de contexto; no es un plazo para presentar formularios. ' : ''}Crear este evento no envía documentos ni confirma que la agencia los acepte.`
        : `Date checked by you in Anchor. All-day reminder: consult your original notice for the exact time and current instructions. ${kind === 'end' ? 'This is a context date, not a filing deadline. ' : ''}Creating this event does not submit documents or confirm agency acceptance.`;
      candidates.push({
        key,
        noticeId: notice.id,
        deadlineId: deadline.id,
        kind,
        date: deadline.date,
        endDate: nextCalendarDay(deadline.date),
        summary,
        description,
        contextOnly: kind === 'end',
      });
    }
  }
  return candidates.sort((first, second) => first.date.localeCompare(second.date));
}

/**
 * The same confirmed semantic date has the same Calendar id across retries and
 * devices. Different workspace/account namespaces cannot collide by design.
 * Hex is a subset of Google's permitted base32hex alphabet; SHA-256 keeps all
 * opaque notice and account identifiers out of the event body.
 */
export async function createCalendarEvent(
  candidate: CalendarCandidate,
  { namespace, mode }: CalendarEventIdentity,
): Promise<CalendarEventPayload> {
  if (!namespace?.trim() || !['personal', 'demo'].includes(mode))
    throw new TypeError('Calendar reminders need a workspace identity.');
  if (
    !candidate?.noticeId ||
    !kinds.includes(candidate.kind) ||
    !validDate(candidate.date) ||
    candidate.endDate !== nextCalendarDay(candidate.date)
  )
    throw new TypeError('Only checked, valid all-day dates can become reminders.');
  if (!globalThis.crypto?.subtle)
    throw new Error('Calendar reminders require a secure browser connection.');
  const identity = JSON.stringify([
    'anchor-calendar-v1',
    namespace,
    mode,
    candidate.noticeId,
    candidate.kind,
    candidate.date,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return {
    id: `anchor${hash}`,
    summary: candidate.summary,
    description:
      (mode === 'demo' ? 'Fictional Anchor practice reminder; not your benefit deadline.\n' : '') +
      candidate.description,
    start: { date: candidate.date },
    end: { date: candidate.endDate },
    visibility: 'private',
    transparency: 'transparent',
    reminders: { useDefault: true },
  };
}
