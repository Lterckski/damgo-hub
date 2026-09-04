import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  cancelMeetingReminders,
  enqueueMeetingNotification,
  scheduleMeetingReminders,
} from "@/lib/meeting-notifications";
import {
  isEndsAtValid,
  isValidHttpUrl,
  MEETING_DETAIL_INCLUDE,
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

  const oldParticipantIds = new Set(existing.participants.map((p) => p.member.id));
  const addedIds = [...newParticipantIds].filter((id) => !oldParticipantIds.has(id));
  const removedIds = [...oldParticipantIds].filter((id) => !newParticipantIds.has(id));
  const remainingIds = [...newParticipantIds].filter((id) => oldParticipantIds.has(id));

  const newDetails = {
    title: title.trim(),
    scheduledAt: scheduledAtDate,
    endsAt: endsAtDate,
    location: typeof location === "string" && location.trim() !== "" ? location.trim() : null,
    meetingUrl: meetingUrlValue,
  };
  const emailRelevantChange = detailsChanged(existing, newDetails);
  const participantsChanged = addedIds.length > 0 || removedIds.length > 0;

  const updated = await prisma.$transaction(async (tx) => {
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

    return meeting;
  });

  const full = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: MEETING_DETAIL_INCLUDE });
  const snapshot = meetingSnapshot(full);

  if (addedIds.length > 0) {
    await enqueueMeetingNotification("INVITATION", meetingId, updated.notificationRevision, addedIds, snapshot);
  }
  if (removedIds.length > 0) {
    await enqueueMeetingNotification(
      "PARTICIPANT_REMOVED",
      meetingId,
      updated.notificationRevision,
      removedIds,
      snapshot,
    );
  }
  if (emailRelevantChange && remainingIds.length > 0) {
    await enqueueMeetingNotification("UPDATED", meetingId, updated.notificationRevision, remainingIds, snapshot);
  }

  // Reschedule reminders on every successful edit, per this spec's
  // "Creating/updating a meeting schedules new reminder runs and cancels
  // any still-pending reminder runs for the previous schedule" — not
  // conditioned on scheduledAt specifically having changed.
  await cancelMeetingReminders(existing);
  const { reminder24hRunId, reminder1hRunId } = await scheduleMeetingReminders(full);
  await prisma.meeting.update({ where: { id: meetingId }, data: { reminder24hRunId, reminder1hRunId } });

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

  await cancelMeetingReminders(meeting);

  const participantIds = meeting.participants.map((p) => p.member.id);
  const snapshot = meetingSnapshot(meeting);

  // Cascades MeetingParticipant/AgendaProposal/AgendaItem rows —
  // MeetingEmailDelivery rows deliberately survive (see
  // 16-meeting-scheduling.md's schema notes: it's durable delivery
  // history keyed on plain string columns, not a relation).
  await prisma.meeting.delete({ where: { id: meetingId } });

  await enqueueMeetingNotification(
    "MEETING_CANCELLED",
    meetingId,
    meeting.notificationRevision,
    participantIds,
    snapshot,
  );

  return NextResponse.json({ ok: true });
}
