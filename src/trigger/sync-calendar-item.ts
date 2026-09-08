import { logger, task } from "@trigger.dev/sdk";

import { prisma } from "@/lib/prisma";
import { getMemberGoogleAccessToken } from "@/lib/google-oauth-token";
import { deleteGoogleCalendarEvent, upsertGoogleCalendarEvent } from "@/lib/google-calendar";
import type { SyncedEventSourceType } from "@/app/generated/prisma/enums";

/**
 * Pushes one Task or CalendarEvent to Google Calendar for every member it's
 * relevant to — see 10-calendar.md's Google Calendar Sync section. Runs as
 * a background job (never inline in a request handler, per
 * architecture-context.md invariant 1) because it makes external API
 * calls per member and can take a while for a group-wide item.
 *
 * Audience:
 * - a Task with assignees syncs only to those members
 * - a Task with no assignees, or any CalendarEvent, is group-wide and
 *   syncs to every member (per the user's call — no shared team calendar,
 *   just a copy on each person's own calendar)
 * - a Meeting syncs to its participants only, matching who the meeting is
 *   actually visible to and who gets its invitation email
 *
 * A member with no connected Google account (no OAuth token via Clerk) is
 * silently skipped — not an error, just nothing to sync to yet.
 */
interface SyncCalendarItemPayload {
  sourceType: SyncedEventSourceType;
  sourceId: string;
}

interface SyncTargetMember {
  id: string;
  clerkUserId: string;
}

interface SyncFields {
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
}

export const syncCalendarItemTask = task({
  id: "sync-calendar-item-to-google",
  maxDuration: 120,
  run: async (payload: SyncCalendarItemPayload) => {
    const { sourceType, sourceId } = payload;

    if (sourceType === "TASK") {
      await syncTask(sourceId);
    } else if (sourceType === "MEETING") {
      await syncMeeting(sourceId);
    } else {
      await syncCalendarEvent(sourceId);
    }
  },
});

async function syncTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { member: true } } },
  });

  if (!task) {
    await removeAllSyncedEvents("TASK", taskId);
    return;
  }

  const allMembers = await prisma.member.findMany();
  const targetMembers: SyncTargetMember[] =
    task.assignees.length > 0 ? task.assignees.map((a) => a.member) : allMembers;

  await syncToMembers(targetMembers, {
    sourceType: "TASK",
    sourceId: taskId,
    fields: {
      title: task.title,
      description: task.description,
      // The Google event spans the task's actual startDate -> dueDate,
      // both mandatory — not a single-point-in-time event anymore.
      startAt: task.startDate,
      endAt: task.dueDate,
    },
  });

  // Drop synced copies for anyone no longer in scope (e.g. unassigned, or
  // a group task that gained specific assignees).
  const targetIds = new Set(targetMembers.map((m) => m.id));
  const stale = await prisma.googleCalendarSyncedEvent.findMany({
    where: { sourceType: "TASK", sourceId: taskId, memberId: { notIn: [...targetIds] } },
    include: { member: true },
  });
  for (const row of stale) {
    await removeSyncedEventRow(row);
  }
}

/**
 * A meeting syncs to each participant's own calendar. Location and the
 * external meeting link ride along in the description, because the whole
 * point of the entry is that someone glancing at their calendar knows
 * where to be without opening Damgo Hub.
 *
 * A deleted meeting arrives here with nothing to look up, which removes
 * every synced copy — the same path a deleted task takes.
 */
async function syncMeeting(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: { include: { member: true } } },
  });

  if (!meeting) {
    await removeAllSyncedEvents("MEETING", meetingId);
    return;
  }

  const targetMembers: SyncTargetMember[] = meeting.participants.map(
    (participant) => participant.member,
  );

  await syncToMembers(targetMembers, {
    sourceType: "MEETING",
    sourceId: meetingId,
    fields: {
      title: meeting.title,
      description: meetingDescription(meeting),
      // endsAt is optional; syncOneMember falls back to a zero-length event
      // at scheduledAt when it is null, same as any other single-point item.
      startAt: meeting.scheduledAt,
      endAt: meeting.endsAt,
    },
  });

  // Someone removed from the participant list loses their copy, the same
  // way an unassigned task does.
  const targetIds = new Set(targetMembers.map((m) => m.id));
  const stale = await prisma.googleCalendarSyncedEvent.findMany({
    where: {
      sourceType: "MEETING",
      sourceId: meetingId,
      memberId: { notIn: [...targetIds] },
    },
    include: { member: true },
  });
  for (const row of stale) {
    await removeSyncedEventRow(row);
  }
}

/** Description shown on the Google event: the meeting's own description,
 *  then where to go — physical location and/or the external link. */
export function meetingDescription(meeting: {
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
}): string | null {
  const parts = [
    meeting.description?.trim() || null,
    meeting.location?.trim() ? `Location: ${meeting.location.trim()}` : null,
    meeting.meetingUrl?.trim() ? `Join: ${meeting.meetingUrl.trim()}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

async function syncCalendarEvent(eventId: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    await removeAllSyncedEvents("CALENDAR_EVENT", eventId);
    return;
  }

  // Every CalendarEvent is org-wide — see 10-calendar.md's Goal.
  const members = await prisma.member.findMany();
  await syncToMembers(members, {
    sourceType: "CALENDAR_EVENT",
    sourceId: eventId,
    fields: {
      title: event.title,
      description: event.description,
      startAt: event.startAt,
      endAt: event.endAt,
    },
  });
}

async function syncToMembers(
  members: SyncTargetMember[],
  item: { sourceType: SyncedEventSourceType; sourceId: string; fields: SyncFields },
) {
  for (const member of members) {
    await syncOneMember(member, item);
  }
}

async function syncOneMember(
  member: SyncTargetMember,
  {
    sourceType,
    sourceId,
    fields,
  }: { sourceType: SyncedEventSourceType; sourceId: string; fields: SyncFields },
) {
  const existing = await prisma.googleCalendarSyncedEvent.findUnique({
    where: { memberId_sourceType_sourceId: { memberId: member.id, sourceType, sourceId } },
  });

  // No date to show (e.g. a task whose due date was cleared) — remove any
  // previously-synced copy and stop.
  if (!fields.startAt) {
    if (existing) await removeSyncedEventRow({ ...existing, member });
    return;
  }

  const accessToken = await getMemberGoogleAccessToken(member.clerkUserId);
  if (!accessToken) return;

  const startAt = fields.startAt;
  const endAt = fields.endAt ?? fields.startAt;

  try {
    const googleEventId = await upsertGoogleCalendarEvent(accessToken, existing?.googleEventId ?? null, {
      summary: fields.title,
      description: fields.description ?? undefined,
      start: { dateTime: startAt.toISOString() },
      end: { dateTime: endAt.toISOString() },
    });

    await prisma.googleCalendarSyncedEvent.upsert({
      where: { memberId_sourceType_sourceId: { memberId: member.id, sourceType, sourceId } },
      create: { memberId: member.id, sourceType, sourceId, googleEventId },
      update: { googleEventId },
    });
  } catch (error) {
    logger.error("Google Calendar sync failed for member", {
      memberId: member.id,
      sourceType,
      sourceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function removeAllSyncedEvents(sourceType: SyncedEventSourceType, sourceId: string) {
  const rows = await prisma.googleCalendarSyncedEvent.findMany({
    where: { sourceType, sourceId },
    include: { member: true },
  });
  for (const row of rows) {
    await removeSyncedEventRow(row);
  }
}

async function removeSyncedEventRow(row: {
  id: string;
  googleEventId: string;
  member: SyncTargetMember;
}) {
  const accessToken = await getMemberGoogleAccessToken(row.member.clerkUserId);
  if (accessToken) {
    try {
      await deleteGoogleCalendarEvent(accessToken, row.googleEventId);
    } catch (error) {
      logger.error("Failed to delete Google Calendar event", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await prisma.googleCalendarSyncedEvent.delete({ where: { id: row.id } });
}
