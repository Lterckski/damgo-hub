/** Shared serialization + query helpers for Meeting API responses — see 16-meeting-scheduling.md. */
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { UnifiedCalendarItem } from "@/lib/calendar";

export interface MeetingMemberOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SerializedAgendaProposal {
  id: string;
  text: string;
  status: string;
  proposedById: string;
  proposedByName: string;
  createdAt: string;
}

export interface SerializedAgendaItem {
  id: string;
  text: string;
  position: number;
  addedById: string;
  addedByName: string;
  sourceProposalId: string | null;
  createdAt: string;
}

export interface SerializedMeetingListItem {
  id: string;
  title: string;
  scheduledAt: string;
  endsAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  organizerId: string;
  organizerName: string;
  participants: MeetingMemberOption[];
}

export interface SerializedMeeting extends SerializedMeetingListItem {
  description: string | null;
  notificationRevision: number;
  agendaProposals: SerializedAgendaProposal[];
  agendaItems: SerializedAgendaItem[];
  createdAt: string;
  updatedAt: string;
}

// select, not include — same reasoning as PROJECT_INCLUDE in lib/projects.ts:
// only organizer.displayName and participant.{id,displayName,avatarUrl} are
// ever read, so a bare `true` include would pull every column on Member for
// every organizer/participant on every meeting the list page fetches.
const MEETING_PARTICIPANTS_INCLUDE = {
  participants: {
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
} as const;

// `satisfies`, not `as const` — `as const` turns agendaItems' multi-field
// `orderBy` array into a readonly tuple, which Prisma's generated
// `MeetingInclude` type rejects (it wants a plain mutable array); `satisfies`
// still gives every string field (`"asc"`, `"desc"`) its narrow literal
// type via the contextual check, without that side effect.
export const MEETING_LIST_INCLUDE = {
  organizer: { select: { displayName: true } },
  ...MEETING_PARTICIPANTS_INCLUDE,
} satisfies Prisma.MeetingInclude;

export const MEETING_DETAIL_INCLUDE = {
  organizer: { select: { displayName: true } },
  ...MEETING_PARTICIPANTS_INCLUDE,
  agendaProposals: {
    orderBy: { createdAt: "asc" },
    include: { proposedBy: { select: { displayName: true } } },
  },
  // position first, then createdAt/id as a defensive stable fallback —
  // per this spec's own note on AgendaItem ordering.
  agendaItems: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: { addedBy: { select: { displayName: true } } },
  },
} satisfies Prisma.MeetingInclude;

function serializeParticipants(
  participants: { member: { id: string; displayName: string; avatarUrl: string | null } }[],
): MeetingMemberOption[] {
  return participants.map((p) => ({
    id: p.member.id,
    displayName: p.member.displayName,
    avatarUrl: p.member.avatarUrl,
  }));
}

export function serializeMeetingListItem(meeting: {
  id: string;
  title: string;
  scheduledAt: Date;
  endsAt: Date | null;
  location: string | null;
  meetingUrl: string | null;
  organizerId: string;
  organizer: { displayName: string };
  participants: { member: { id: string; displayName: string; avatarUrl: string | null } }[];
}): SerializedMeetingListItem {
  return {
    id: meeting.id,
    title: meeting.title,
    scheduledAt: meeting.scheduledAt.toISOString(),
    endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    location: meeting.location,
    meetingUrl: meeting.meetingUrl,
    organizerId: meeting.organizerId,
    organizerName: meeting.organizer.displayName,
    participants: serializeParticipants(meeting.participants),
  };
}

export function serializeMeeting(meeting: {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  endsAt: Date | null;
  location: string | null;
  meetingUrl: string | null;
  organizerId: string;
  organizer: { displayName: string };
  notificationRevision: number;
  participants: { member: { id: string; displayName: string; avatarUrl: string | null } }[];
  agendaProposals: {
    id: string;
    text: string;
    status: string;
    proposedById: string;
    proposedBy: { displayName: string };
    createdAt: Date;
  }[];
  agendaItems: {
    id: string;
    text: string;
    position: number;
    addedById: string;
    addedBy: { displayName: string };
    sourceProposalId: string | null;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}): SerializedMeeting {
  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    scheduledAt: meeting.scheduledAt.toISOString(),
    endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    location: meeting.location,
    meetingUrl: meeting.meetingUrl,
    organizerId: meeting.organizerId,
    organizerName: meeting.organizer.displayName,
    notificationRevision: meeting.notificationRevision,
    participants: serializeParticipants(meeting.participants),
    agendaProposals: meeting.agendaProposals.map((p) => ({
      id: p.id,
      text: p.text,
      status: p.status,
      proposedById: p.proposedById,
      proposedByName: p.proposedBy.displayName,
      createdAt: p.createdAt.toISOString(),
    })),
    agendaItems: meeting.agendaItems.map((item) => ({
      id: item.id,
      text: item.text,
      position: item.position,
      addedById: item.addedById,
      addedByName: item.addedBy.displayName,
      sourceProposalId: item.sourceProposalId,
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}

/**
 * Splits a meeting list into Upcoming/Past for the /meetings page's two
 * tabs. A plain helper (not inline in the page component) so the
 * `Date.now()` read it needs doesn't run inside a component's render body
 * — this project's lint config (`react-hooks/purity`) flags any impure
 * call there, Server Components included.
 */
export function splitMeetingsByTime(
  meetings: SerializedMeetingListItem[],
  now: Date = new Date(),
): { upcoming: SerializedMeetingListItem[]; past: SerializedMeetingListItem[] } {
  const nowMs = now.getTime();
  const effectiveEnd = (meeting: SerializedMeetingListItem) =>
    new Date(meeting.endsAt ?? meeting.scheduledAt).getTime();
  const upcoming = meetings
    .filter((m) => effectiveEnd(m) >= nowMs)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = meetings
    .filter((m) => effectiveEnd(m) < nowMs)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  return { upcoming, past };
}

/** Whether `memberId` is a participant of a meeting whose participants were fetched as `{ memberId }` rows. */
export function isMeetingParticipant(participants: { memberId: string }[], memberId: string): boolean {
  return participants.some((p) => p.memberId === memberId);
}

/**
 * The same "visible to the current member" rule everywhere a meeting list
 * is queried: a participant sees their own meetings, an Admin sees every
 * meeting — see this spec's Permissions section and GET /api/meetings.
 * Shared between that route and the /meetings page's own direct Prisma
 * query (per this app's established "server pages query Prisma directly"
 * pattern — see progress-tracker.md's Architecture Decisions) so the two
 * can't drift on what "visible" means.
 */
export function meetingVisibilityWhere(memberId: string, isAdmin: boolean): Prisma.MeetingWhereInput {
  return isAdmin ? {} : { participants: { some: { memberId } } };
}

// --- Shared validation --------------------------------------------------
// Reused by POST /api/meetings and PATCH /api/meetings/[meetingId] — see
// this spec's "Validate that endsAt... is later than scheduledAt. Validate
// meetingUrl as an http or https URL."

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isEndsAtValid(scheduledAt: Date, endsAt: Date | null): boolean {
  return endsAt === null || endsAt.getTime() > scheduledAt.getTime();
}

// --- Agenda position management --------------------------------------
// Positions are contiguous, zero-based, and unique within a meeting — see
// 16-meeting-scheduling.md's note on AgendaItem records.

type TransactionClient = Prisma.TransactionClient;

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

/** Runs position allocation and its write as one serializable, retryable unit. */
export async function runSerializableMeetingTransaction<T>(
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      const isWriteConflict =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
      if (!isWriteConflict || attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
  throw new Error("Serializable meeting transaction exhausted its retries");
}

export async function nextAgendaPosition(tx: TransactionClient, meetingId: string): Promise<number> {
  const last = await tx.agendaItem.findFirst({
    where: { meetingId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
}

/** Closes the gap left by removing the item at `removedPosition`. */
export async function compactAgendaPositions(
  tx: TransactionClient,
  meetingId: string,
  removedPosition: number,
): Promise<void> {
  await tx.agendaItem.updateMany({
    where: { meetingId, position: { gt: removedPosition } },
    data: { position: { decrement: 1 } },
  });
}

/**
 * Moves one agenda item to `targetPosition` (clamped into range) and
 * renumbers every affected item in between, per this spec's "reordering
 * rewrites all affected positions in one transaction."
 *
 * Writes in two passes rather than directly to final positions:
 * `@@unique([meetingId, position])` is checked per-statement, not
 * deferred, so writing final positions in the wrong order can collide
 * with a position another item in this same reorder still holds at that
 * instant. Bumping every affected row into a disjoint temporary range
 * first guarantees neither pass can ever collide.
 */
export async function moveAgendaItemToPosition(
  tx: TransactionClient,
  meetingId: string,
  itemId: string,
  targetPosition: number,
): Promise<void> {
  const items = await tx.agendaItem.findMany({ where: { meetingId }, orderBy: { position: "asc" } });
  const current = items.find((item) => item.id === itemId);
  if (!current) {
    throw new Error("Agenda item not found in this meeting");
  }

  const clamped = Math.max(0, Math.min(targetPosition, items.length - 1));
  if (clamped === current.position) return;

  const reordered = items.filter((item) => item.id !== itemId);
  reordered.splice(clamped, 0, current);

  const TEMP_OFFSET = 100_000;
  for (const item of reordered) {
    await tx.agendaItem.update({ where: { id: item.id }, data: { position: item.position + TEMP_OFFSET } });
  }
  for (let index = 0; index < reordered.length; index++) {
    await tx.agendaItem.update({ where: { id: reordered[index].id }, data: { position: index } });
  }
}

// --- Calendar integration ---------------------------------------------
// See 16-meeting-scheduling.md's Calendar Integration section.

/**
 * Meetings visible to `member` mapped into the unified calendar shape —
 * a participant sees their own meetings, an Admin sees every meeting.
 * `range` applies the same overlap-based filtering
 * GET /api/calendar/events already uses for tasks: the meeting's complete
 * interval (`scheduledAt` through `endsAt`, or just `scheduledAt` if
 * `endsAt` is unset) must overlap `[range.gte, range.lte]`.
 */
export async function getVisibleMeetingCalendarItems(
  memberId: string,
  isAdmin: boolean,
  range?: { gte: Date; lte: Date },
): Promise<UnifiedCalendarItem[]> {
  const meetings = await prisma.meeting.findMany({
    where: {
      ...meetingVisibilityWhere(memberId, isAdmin),
      ...(range
        ? {
            scheduledAt: { lte: range.lte },
            OR: [{ endsAt: { gte: range.gte } }, { endsAt: null, scheduledAt: { gte: range.gte } }],
          }
        : {}),
    },
    select: { id: true, title: true, scheduledAt: true, endsAt: true },
    orderBy: { scheduledAt: "asc" },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    type: "meeting" as const,
    startAt: meeting.scheduledAt.toISOString(),
    endAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    creatorId: null,
  }));
}
