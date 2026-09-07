import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  cancelMeetingReminders,
  createMeetingNotificationOutbox,
  enqueueMeetingNotificationOutboxes,
  scheduleMeetingReminders,
} from "@/lib/meeting-notifications";
import { resolveEffectiveEndsAt } from "@/lib/meeting-format";
import {
  isEndsAtValid,
  isValidHttpUrl,
  MEETING_DETAIL_INCLUDE,
  runSerializableMeetingTransaction,
  serializeMeeting,
} from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";

// Fields that count as "email-relevant meeting details" per this spec's
// Email Notifications section — description is deliberately excluded
// (shown in every email, but changing it alone never triggers one).
function detailsChanged(
  before: {
    title: string;
    scheduledAt: Date;
    endsAt: Date | null;
    location: string | null;
    meetingUrl: string | null;
  },
  after: {
    title: string;
    scheduledAt: Date;
    endsAt: Date | null;
    location: string | null;
    meetingUrl: string | null;
  },
): boolean {
  return (
    before.title !== after.title ||
    before.scheduledAt.getTime() !== after.scheduledAt.getTime() ||
    (before.endsAt?.getTime() ?? null) !== (after.endsAt?.getTime() ?? null) ||
    before.location !== after.location ||
    before.meetingUrl !== after.meetingUrl
  );
}

function meetingSnapshot(meeting: {
  title: string;
  description: string | null;
  scheduledAt: Date;
  endsAt: Date | null;
  location: string | null;
  meetingUrl: string | null;
  organizer: { displayName: string };
  agendaItems: { text: string }[];
}) {
  return {
    title: meeting.title,
    description: meeting.description,
    scheduledAt: meeting.scheduledAt.toISOString(),
    endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    location: meeting.location,
    meetingUrl: meeting.meetingUrl,
    organizerName: meeting.organizer.displayName,
    agendaItems: meeting.agendaItems.map((item) => item.text),
  };
}

// GET /api/meetings/[meetingId] — requires participation or Admin.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const [member, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);

  const meeting = await prisma.meeting.findUnique({
    where: {
      ...{ id: meetingId },
      AND: [await entityVisibilityWhere("meeting")],
    },
    include: MEETING_DETAIL_INCLUDE,
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const isParticipant = meeting.participants.some(
    (p) => p.member.id === member.id,
  );
  if (!isParticipant && !isAdmin && meeting.visibilityScope !== "org") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ meeting: serializeMeeting(meeting) });
}

// PATCH /api/meetings/[meetingId] — organizer only. Edits meeting details
// and participants together (a full replace of the editable fields, not a
// partial patch) — see this spec's Routes section.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const isAdmin = await isCurrentMemberAdmin();

  const existing = await prisma.meeting.findUnique({
    where: {
      ...{ id: meetingId },
      AND: [await entityVisibilityWhere("meeting")],
    },
    include: MEETING_DETAIL_INCLUDE,
  });
  if (!existing) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  // Admin only. Editing a meeting is an `org:admin` action, and any admin
  // may edit any meeting — that is what lets an admin correct a meeting a
  // member organized before scheduling was restricted.
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only an admin can edit this meeting" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const {
    title,
    description,
    scheduledAt,
    endsAt,
    location,
    meetingUrl,
    participantIds,
  } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (
    typeof scheduledAt !== "string" ||
    Number.isNaN(Date.parse(scheduledAt))
  ) {
    return NextResponse.json(
      { error: "scheduledAt must be a valid date" },
      { status: 400 },
    );
  }
  const scheduledAtDate = new Date(scheduledAt);

  // The "Ends" field no longer exists in the Schedule/Edit Meeting form —
  // it never sends `endsAt` at all now. Distinguishing "key absent" from
  // "explicit empty string" (rather than always defaulting to null) is
  // what keeps an *existing* meeting's already-set endsAt intact across
  // an edit that has nothing to do with it, per this app's backward-
  // compatibility requirement for old records. A caller that does send
  // the key — some future admin tool, say — can still set or clear it
  // explicitly; only PATCH requests lacking the key entirely are treated
  // as "don't touch."
  const endsAtProvided = Object.prototype.hasOwnProperty.call(body, "endsAt");
  let endsAtDate: Date | null = null;
  if (endsAtProvided && typeof endsAt === "string" && endsAt !== "") {
    if (Number.isNaN(Date.parse(endsAt))) {
      return NextResponse.json(
        { error: "endsAt must be a valid date" },
        { status: 400 },
      );
    }
    endsAtDate = new Date(endsAt);
    if (!isEndsAtValid(scheduledAtDate, endsAtDate)) {
      return NextResponse.json(
        { error: "endsAt must be later than scheduledAt" },
        { status: 400 },
      );
    }
  }

  let meetingUrlValue: string | null = null;
  if (typeof meetingUrl === "string" && meetingUrl.trim() !== "") {
    if (!isValidHttpUrl(meetingUrl.trim())) {
      return NextResponse.json(
        { error: "meetingUrl must be a valid http(s) URL" },
        { status: 400 },
      );
    }
    meetingUrlValue = meetingUrl.trim();
  }

  const requestedIds: string[] = Array.isArray(participantIds)
    ? participantIds.filter((id): id is string => typeof id === "string")
    : [];
  const uniqueRequestedIds = [
    ...new Set([...requestedIds, existing.organizerId]),
  ];
  const realMembers = await prisma.member.findMany({
    where: { id: { in: uniqueRequestedIds } },
    select: { id: true },
  });
  const newParticipantIds = new Set(realMembers.map((m) => m.id));

  const newDetails = {
    title: title.trim(),
    scheduledAt: scheduledAtDate,
    location:
      typeof location === "string" && location.trim() !== ""
        ? location.trim()
        : null,
    meetingUrl: meetingUrlValue,
  };
  const transactionResult = await runSerializableMeetingTransaction(
    async (tx) => {
      const current = await tx.meeting.findUnique({
        where: { id: meetingId },
        include: MEETING_DETAIL_INCLUDE,
      });
      if (!current) return { kind: "not-found" } as const;
      if (!isAdmin) return { kind: "forbidden" } as const;

      const effectiveEndsAt = resolveEffectiveEndsAt(
        endsAtProvided,
        endsAtDate,
        current.endsAt,
      );

      const oldParticipantIds = new Set(
        current.participants.map((participant) => participant.member.id),
      );
      const addedIds = [...newParticipantIds].filter(
        (id) => !oldParticipantIds.has(id),
      );
      const removedIds = [...oldParticipantIds].filter(
        (id) => !newParticipantIds.has(id),
      );
      const remainingIds = [...newParticipantIds].filter((id) =>
        oldParticipantIds.has(id),
      );
      const emailRelevantChange = detailsChanged(current, {
        ...newDetails,
        endsAt: effectiveEndsAt,
      });
      const participantsChanged = addedIds.length > 0 || removedIds.length > 0;

      const meeting = await tx.meeting.update({
        where: { id: meetingId },
        data: {
          ...newDetails,
          ...(endsAtProvided ? { endsAt: endsAtDate } : {}),
          description:
            typeof description === "string" && description.trim() !== ""
              ? description.trim()
              : null,
          ...(emailRelevantChange || participantsChanged
            ? { notificationRevision: { increment: 1 } }
            : {}),
        },
      });

      if (participantsChanged) {
        if (removedIds.length > 0) {
          await tx.meetingParticipant.deleteMany({
            where: { meetingId, memberId: { in: removedIds } },
          });
        }
        if (addedIds.length > 0) {
          await tx.meetingParticipant.createMany({
            data: addedIds.map((memberId) => ({ meetingId, memberId })),
            skipDuplicates: true,
          });
        }
      }

      const full = await tx.meeting.findUniqueOrThrow({
        where: { id: meetingId },
        include: MEETING_DETAIL_INCLUDE,
      });
      const snapshot = meetingSnapshot(full);
      const outboxIds = await Promise.all([
        createMeetingNotificationOutbox(
          tx,
          "INVITATION",
          meetingId,
          meeting.notificationRevision,
          addedIds,
          snapshot,
        ),
        createMeetingNotificationOutbox(
          tx,
          "PARTICIPANT_REMOVED",
          meetingId,
          meeting.notificationRevision,
          removedIds,
          snapshot,
        ),
        emailRelevantChange
          ? createMeetingNotificationOutbox(
              tx,
              "UPDATED",
              meetingId,
              meeting.notificationRevision,
              remainingIds,
              snapshot,
            )
          : null,
      ]);

      return {
        kind: "success",
        full,
        outboxIds,
        previousReminderRuns: {
          reminder24hRunId: current.reminder24hRunId,
          reminder1hRunId: current.reminder1hRunId,
        },
      } as const;
    },
  );

  if (transactionResult.kind === "not-found") {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (transactionResult.kind === "forbidden") {
    return NextResponse.json(
      { error: "Only an admin can edit this meeting" },
      { status: 403 },
    );
  }
  const { full, outboxIds, previousReminderRuns } = transactionResult;

  try {
    await enqueueMeetingNotificationOutboxes(outboxIds);
  } catch (error) {
    console.error(
      "Failed to enqueue meeting notification outboxes after update",
      { meetingId, error },
    );
  }

  // Reschedules, retitles and participant changes all have to reach the
  // synced copies: the job re-upserts for current participants and deletes
  // the copy of anyone dropped from the list. Outside the outbox try/catch
  // on purpose — a failed email enqueue must not also skip the calendar.
  await enqueueGoogleCalendarSync("MEETING", meetingId);

  // Reschedule reminders on every successful edit, per this spec's
  // "Creating/updating a meeting schedules new reminder runs and cancels
  // any still-pending reminder runs for the previous schedule" — not
  // conditioned on scheduledAt specifically having changed.
  try {
    await cancelMeetingReminders(previousReminderRuns);
    const scheduledRuns = await scheduleMeetingReminders(full);
    const stored = await prisma.meeting.updateMany({
      where: { id: meetingId, notificationRevision: full.notificationRevision },
      data: scheduledRuns,
    });
    if (stored.count === 0) {
      await cancelMeetingReminders(scheduledRuns);
    }
  } catch (error) {
    console.error("Failed to reconcile reminder runs after meeting update", {
      meetingId,
      error,
    });
  }

  return NextResponse.json({ meeting: serializeMeeting(full) });
}

// DELETE /api/meetings/[meetingId] — organizer only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const isAdmin = await isCurrentMemberAdmin();

  const meeting = await prisma.meeting.findUnique({
    where: {
      ...{ id: meetingId },
      AND: [await entityVisibilityWhere("meeting")],
    },
    include: MEETING_DETAIL_INCLUDE,
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only an admin can delete this meeting" },
      { status: 403 },
    );
  }

  const participantIds = meeting.participants.map((p) => p.member.id);
  const snapshot = meetingSnapshot(meeting);

  // Cascades MeetingParticipant/AgendaProposal/AgendaItem rows —
  // MeetingEmailDelivery rows deliberately survive (see
  // 16-meeting-scheduling.md's schema notes: it's durable delivery
  // history keyed on plain string columns, not a relation).
  const cancellationOutboxId = await prisma.$transaction(async (tx) => {
    const outboxId = await createMeetingNotificationOutbox(
      tx,
      "MEETING_CANCELLED",
      meetingId,
      meeting.notificationRevision,
      participantIds,
      snapshot,
    );
    await tx.meeting.delete({ where: { id: meetingId } });
    return outboxId;
  });

  await cancelMeetingReminders(meeting).catch((error) => {
    console.error("Failed to cancel reminders after meeting deletion", {
      meetingId,
      error,
    });
  });
  if (cancellationOutboxId)
    await enqueueMeetingNotificationOutboxes([cancellationOutboxId]);
  // The meeting row is gone, so the job finds nothing and removes every
  // synced copy from the participants' calendars.
  await enqueueGoogleCalendarSync("MEETING", meetingId);

  return NextResponse.json({ ok: true });
}
