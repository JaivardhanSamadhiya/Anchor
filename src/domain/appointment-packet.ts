/**
 * An appointment packet is a resident-selected snapshot, never a submission or
 * an eligibility decision. This contract contains no account, network or file
 * storage calls. The caller explicitly chooses which notices and files to share.
 */
import type { ContinuityNotice, ContinuityWorkspace, LedgerEvent } from './continuity.js';
import { validDate } from './continuity.js';

export type PacketLanguage = 'en' | 'es';
export interface PacketNotice {
  id: string;
  title: string;
  program?: string;
  county?: string;
  reviewed: boolean;
  requests: {
    id: string;
    title: string;
    kind?: string;
    status?: string;
    quote?: string;
    line?: number;
  }[];
  deadlines: {
    id: string;
    label?: string;
    kind?: string;
    date: string | null;
    confirmed?: boolean;
    excluded?: boolean;
  }[];
}
export interface PacketSubmission {
  id: string;
  noticeId?: string;
  date: string;
  title?: string;
  detail?: string;
  attachmentId?: string | null;
  kind?: string;
}
export interface AppointmentPacketInput {
  language: PacketLanguage;
  createdAt: string;
  appointment?: { date?: string; location?: string };
  residentName?: string;
  notices: PacketNotice[];
  questions: string[];
  submissions: PacketSubmission[];
  selectedAttachmentIds: string[];
  includeSubmissionHistory: boolean;
}
export interface AppointmentAttachment {
  id: string;
  name: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'text/plain';
  /** Official forms are only listed: their editable originals remain separate. */
  role?: 'supporting-document' | 'official-form';
  bytes?: Uint8Array;
  unsignedEditableDownloadSeparate?: boolean;
}
export interface AppointmentPacketOptions {
  language?: PacketLanguage;
  createdAt: string;
  /** An empty array produces no notice summary; absent means all notices. */
  noticeIds?: string[];
  questions?: string[];
  selectedAttachmentIds?: string[];
  includeSubmissionHistory?: boolean;
  residentName?: string;
  appointment?: AppointmentPacketInput['appointment'];
}

export const APPOINTMENT_PACKET_LIMITS = Object.freeze({
  notices: 30,
  requestsPerNotice: 80,
  deadlinesPerNotice: 30,
  questions: 25,
  submissions: 100,
  attachments: 16,
  attachmentBytes: 20 * 1024 * 1024,
  totalAttachmentBytes: 40 * 1024 * 1024,
  attachmentPages: 60,
  packetPages: 100,
  textAttachmentCharacters: 40_000,
});

function boundedText(value: unknown, label: string, limit = 2000): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value.length > limit)
    throw new Error(`${label} must be text no longer than ${limit} characters.`);
}

function uniqueIds(values: unknown, label: string, limit: number): asserts values is string[] {
  if (
    !Array.isArray(values) ||
    values.length > limit ||
    values.some((value) => typeof value !== 'string' || !value || value.length > 200) ||
    new Set(values).size !== values.length
  )
    throw new Error(`${label} must contain unique selected IDs (up to ${limit}).`);
}

/** Reject malformed or oversized snapshots before any PDF library is invoked. */
export function validateAppointmentPacketInput(input: AppointmentPacketInput): void {
  if (!input || !['en', 'es'].includes(input.language))
    throw new Error('Choose English or Spanish for the packet.');
  if (
    typeof input.createdAt !== 'string' ||
    input.createdAt.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(input.createdAt) ||
    !validDate(input.createdAt.slice(0, 10)) ||
    Number.isNaN(new Date(input.createdAt).getTime())
  )
    throw new Error('Choose a valid packet creation date.');
  if (!Array.isArray(input.notices) || input.notices.length > APPOINTMENT_PACKET_LIMITS.notices)
    throw new Error('Choose up to 30 notices for one appointment packet.');
  uniqueIds(
    input.notices.map((notice) => notice?.id),
    'Notices',
    APPOINTMENT_PACKET_LIMITS.notices,
  );
  uniqueIds(input.selectedAttachmentIds, 'Attachments', APPOINTMENT_PACKET_LIMITS.attachments);
  boundedText(input.residentName, 'Resident name', 200);
  if (input.appointment != null) {
    if (typeof input.appointment !== 'object') throw new Error('Choose valid appointment details.');
    boundedText(input.appointment.date, 'Appointment date', 100);
    boundedText(input.appointment.location, 'Appointment location', 300);
  }
  for (const notice of input.notices) {
    boundedText(notice.title, 'Notice title', 400);
    boundedText(notice.program, 'Program', 120);
    boundedText(notice.county, 'County', 120);
    if (typeof notice.reviewed !== 'boolean') throw new Error('Choose a notice review status.');
    if (
      !Array.isArray(notice.requests) ||
      notice.requests.length > APPOINTMENT_PACKET_LIMITS.requestsPerNotice ||
      !Array.isArray(notice.deadlines) ||
      notice.deadlines.length > APPOINTMENT_PACKET_LIMITS.deadlinesPerNotice
    )
      throw new Error('This notice has too many requests or dates for one packet.');
    for (const request of notice.requests) {
      if (!request || typeof request !== 'object') throw new Error('Choose valid notice requests.');
      boundedText(request.id, 'Request ID', 200);
      boundedText(request.title, 'Request title', 600);
      boundedText(request.quote, 'Original request', 4000);
      boundedText(request.kind, 'Request type', 100);
      boundedText(request.status, 'Request status', 100);
      if (request.line != null && (!Number.isInteger(request.line) || request.line < 1))
        throw new Error('A request source line must be a positive whole number.');
    }
    for (const deadline of notice.deadlines) {
      if (!deadline || typeof deadline !== 'object') throw new Error('Choose valid notice dates.');
      boundedText(deadline.id, 'Date ID', 200);
      boundedText(deadline.label, 'Date label', 400);
      boundedText(deadline.kind, 'Date type', 100);
      boundedText(deadline.date, 'Notice date', 40);
    }
  }
  if (
    !Array.isArray(input.questions) ||
    input.questions.length > APPOINTMENT_PACKET_LIMITS.questions
  )
    throw new Error('Choose up to 25 questions for the appointment.');
  for (const question of input.questions) {
    if (typeof question !== 'string') throw new Error('Appointment questions must be text.');
    boundedText(question, 'Appointment question', 4000);
  }
  if (
    typeof input.includeSubmissionHistory !== 'boolean' ||
    !Array.isArray(input.submissions) ||
    input.submissions.length > APPOINTMENT_PACKET_LIMITS.submissions
  )
    throw new Error('Choose up to 100 submission records.');
  for (const event of input.submissions) {
    if (!event || typeof event !== 'object') throw new Error('Choose valid submission records.');
    boundedText(event.id, 'Submission ID', 200);
    boundedText(event.noticeId, 'Submission notice ID', 200);
    boundedText(event.date, 'Submission date', 100);
    boundedText(event.title, 'Submission title', 400);
    boundedText(event.detail, 'Submission details', 4000);
    boundedText(event.attachmentId, 'Submission file ID', 200);
    boundedText(event.kind, 'Submission type', 100);
  }
}

/** Translate the existing continuity workspace without mutating saved facts. */
export function createAppointmentPacketInput(
  workspace: ContinuityWorkspace,
  options: AppointmentPacketOptions,
): AppointmentPacketInput {
  const requested = options.noticeIds ?? workspace.notices.map((notice) => notice.id);
  uniqueIds(requested, 'Notices', APPOINTMENT_PACKET_LIMITS.notices);
  const selected = new Set(requested);
  for (const id of selected)
    if (!workspace.notices.some((notice) => notice.id === id))
      throw new Error('A selected notice is unavailable. Refresh the packet choices.');
  const notices = workspace.notices.filter((notice) => selected.has(notice.id));
  const submissions = (options.includeSubmissionHistory ? workspace.events : []).filter(
    (event) =>
      event.noticeId &&
      selected.has(event.noticeId) &&
      ['submitted', 'acknowledged', 'followup'].includes(event.kind),
  );
  const input: AppointmentPacketInput = {
    language: options.language ?? 'en',
    createdAt: options.createdAt,
    notices: notices.map((notice: ContinuityNotice) => ({
      id: notice.id,
      title: notice.title,
      ...(notice.program ? { program: notice.program } : {}),
      ...(notice.county ? { county: notice.county } : {}),
      reviewed: notice.reviewed === true,
      requests: notice.requests.map((request) => ({ ...request })),
      deadlines: notice.deadlines.map((deadline) => ({ ...deadline })),
    })),
    submissions: submissions.map((event: LedgerEvent) => ({ ...event })),
    questions: [...(options.questions ?? [])],
    selectedAttachmentIds: [...(options.selectedAttachmentIds ?? [])],
    includeSubmissionHistory: options.includeSubmissionHistory === true,
    ...(options.residentName ? { residentName: options.residentName } : {}),
    ...(options.appointment ? { appointment: { ...options.appointment } } : {}),
  };
  validateAppointmentPacketInput(input);
  return input;
}
