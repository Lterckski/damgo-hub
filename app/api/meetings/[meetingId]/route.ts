import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  cancelMeetingReminders,
  createMeetingNotificationOutbox,
  enqueueMeetingNotificationOutboxes,
  scheduleMeetingReminders,
} from "@/lib/meeting-notifications";
import {
  isEndsAtValid,
  isValidHttpUrl,
  MEETING_DETAIL_INCLUDE,
  runSerializableMeetingTransaction,
  serializeMeeting,
} from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

// Fields that count as "email-relevant meeting details" per this spec's
// Email Notifications section — description is deliberately excluded
// (shown in every email, but changing it alone never triggers one).
function detailsChanged(
  before: { title: string; scheduledAt: Date; endsAt: Date | null; location: string | null; meetingUrl: string | null },
  after: { title: string; scheduledAt: Date; endsAt: Date | null; location: string | null; meetingUrl: string | null },
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
}) {
  return {
    title: meeting.title,
    description: meeting.description,
    scheduledAt: meeting.scheduledAt.toISOString(),
    endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    location: meeting.location,
    meetingUrl: meeting.meetingUrl,
    organizerName: meeting.organizer.displayName,
  };
}

// GET /api/meetings/[meetingId] — requires participation or Admin.
export async function GET(_request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const [member, isAdmin] = await Promise.all([getCurrentMember(), isCurrentMemberAdmin()]);

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const isParticipant = meeting.participants.some((p) => p.member.id === member.id);
  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ meeting: serializeMeeting(meeting) });
}

// PATCH /api/meetings/[meetingId] — organizer only. Edits meeting details
// and participants together (a full replace of the editable fields, not a
// partial patch) — see this spec's Routes section.
export async function PATCH(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const member = await getCurrentMember();

  const existing = await prisma.meeting.findUnique({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
  if (!existing) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  // Organizer only — Admin agenda authority does not extend to another
  // organizer's meeting details, per this spec's explicit call-out.
  if (existing.organizerId !== member.id) {
    return NextResponse.json({ error: "Only the organizer can edit this meeting" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { title, description, scheduledAt, endsAt, location, meetingUrl, participantIds } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof scheduledAt !== "string" || Number.isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: "scheduledAt must be a valid date" }, { status: 400 });
  }
  const scheduledAtDate = new Date(scheduledAt);

  let endsAtDate: Date | null = null;
  if (typeof endsAt === "string" && endsAt !== "") {
    if (Number.isNaN(Date.parse(endsAt))) {
      return NextResponse.json({ error: "endsAt must be a valid date" }, { status: 400 });
    }
    endsAtDate = new Date(endsAt);
    if (!isEndsAtValid(scheduledAtDate, endsAtDate)) {
      return NextResponse.json({ error: "endsAt must be later than scheduledAt" }, { status: 400 });
    }
  }

  let meetingUrlValue: string | null = null;
  if (typeof meetingUrl === "string" && meetingUrl.trim() !== "") {
    if (!isValidHttpUrl(meetingUrl.trim())) {
      return NextResponse.json({ error: "meetingUrl must be a valid http(s) URL" }, { status: 400 });
    }
    meetingUrlValue = meetingUrl.trim();
  }

  const requestedIds: string[] = Array.isArray(participantIds)
    ? participantIds.filter((id): id is string => typeof id === "string")
    : [];
  const uniqueRequestedIds = [...new Set([...requestedIds, existing.organizerId])];
  const realMembers = await prisma.member.findMany({
    where: { id: { in: uniqueRequestedIds } },
    select: { id: true },
  });
  const newParticipantIds = new Set(realMembers.map((m) => m.id));

  const newDetails = {
    title: title.trim(),
    scheduledAt: scheduledAtDate,
    endsAt: endsAtDate,
    location: typeof location === "string" && location.trim() !== "" ? location.trim() : null,
    meetingUrl: meetingUrlValue,
  };
  const transactionResult = await runSerializableMeetingTransaction(async (tx) => {
    const current = await tx.meeting.findUnique({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
    if (!current) return { kind: "not-found" } as const;
    if (current.organizerId !== member.id) return { kind: "forbidden" } as const;

    const oldParticipantIds = new Set(current.participants.map((participant) => participant.member.id));
    const addedIds = [...newParticipantIds].filter((id) => !oldParticipantIds.has(id));
    const removedIds = [...oldParticipantIds].filter((id) => !newParticipantIds.has(id));
    const remainingIds = [...newParticipantIds].filter((id) => oldParticipantIds.has(id));
    const emailRelevantChange = detailsChanged(current, newDetails);
    const participantsChanged = addedIds.length > 0 || removedIds.length > 0;

    const meeting = await tx.meeting.update({
      where: { id: meetingId },
      data: {
        ...newDetails,
        description: typeof description === "string" && description.trim() !== "" ? description.trim() : null,
        ...(emailRelevantChange || participantsChanged ? { notificationRevision: { increment: 1 } } : {}),
      },
    });

    if (participantsChanged) {
      if (removedIds.length > 0) {
        await tx.meetingParticipant.deleteMany({ where: { meetingId, memberId: { in: removedIds } } });
      }
      if (addedIds.length > 0) {
        await tx.meetingParticipant.createMany({
          data: addedIds.map((memberId) => ({ meetingId, memberId })),
          skipDuplicates: true,
        });
      }
    }

    const full = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
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
  });

  if (transactionResult.kind === "not-found") {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (transactionResult.kind === "forbidden") {
    return NextResponse.json({ error: "Only the organizer can edit this meeting" }, { status: 403 });
  }
  const { full, outboxIds, previousReminderRuns } = transactionResult;

  try {
    await enqueueMeetingNotificationOutboxes(outboxIds);
  } catch (error) {
    console.error("Failed to enqueue meeting notification outboxes after update", { meetingId, error });
  }

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
    console.error("Failed to reconcile reminder runs after meeting update", { meetingId, error });
  }

  return NextResponse.json({ meeting: serializeMeeting(full) });
}

// DELETE /api/meetings/[meetingId] — organizer only.
export async function DELETE(_request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;
  const member = await getCurrentMember();

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (meeting.organizerId !== member.id) {
    return NextResponse.json({ error: "Only the organizer can delete this meeting" }, { status: 403 });
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
    console.error("Failed to cancel reminders after meeting deletion", { meetingId, error });
  });
  if (cancellationOutboxId) await enqueueMeetingNotificationOutboxes([cancellationOutboxId]);

  return NextResponse.json({ ok: true });
}
