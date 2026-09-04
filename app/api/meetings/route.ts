import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { enqueueMeetingNotification, scheduleMeetingReminders } from "@/lib/meeting-notifications";
import {
  isEndsAtValid,
  isValidHttpUrl,
  MEETING_LIST_INCLUDE,
  meetingVisibilityWhere,
  serializeMeetingListItem,
} from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

// GET /api/meetings — meetings visible to the current member (their own
// participations, or every meeting for an Admin). ?upcoming=true limits
// to meetings that haven't started yet.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await getCurrentMember();
  const isAdmin = await isCurrentMemberAdmin();

  const { searchParams } = new URL(request.url);
  const upcomingOnly = searchParams.get("upcoming") === "true";

  const meetings = await prisma.meeting.findMany({
    where: {
      ...meetingVisibilityWhere(member.id, isAdmin),
      ...(upcomingOnly ? { scheduledAt: { gte: new Date() } } : {}),
    },
    include: MEETING_LIST_INCLUDE,
    orderBy: { scheduledAt: upcomingOnly ? "asc" : "desc" },
  });

  return NextResponse.json({ meetings: meetings.map(serializeMeetingListItem) });
}

// POST /api/meetings — any authenticated member can schedule a meeting
// and becomes its organizer, automatically included as a participant.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizer = await getCurrentMember();
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

  // Normalize participants: dedupe, always include the organizer, and
  // drop any id that isn't a real member rather than letting a bad id
  // crash the create with a raw FK error — same normalization PATCH's
  // spec text calls for, applied here too since the organizer is
  // "automatically included as a participant" from the moment of
  // creation, per this spec's Permissions section.
  const requestedIds: string[] = Array.isArray(participantIds)
    ? participantIds.filter((id): id is string => typeof id === "string")
    : [];
  const uniqueRequestedIds = [...new Set([...requestedIds, organizer.id])];
  const realMembers = await prisma.member.findMany({
    where: { id: { in: uniqueRequestedIds } },
    select: { id: true, displayName: true },
  });
  const participantMemberIds = realMembers.map((m) => m.id);

  const meeting = await prisma.meeting.create({
    data: {
      title: title.trim(),
      description: typeof description === "string" && description.trim() !== "" ? description.trim() : null,
      scheduledAt: scheduledAtDate,
      endsAt: endsAtDate,
      location: typeof location === "string" && location.trim() !== "" ? location.trim() : null,
      meetingUrl: meetingUrlValue,
      organizerId: organizer.id,
      participants: { create: participantMemberIds.map((memberId) => ({ memberId })) },
    },
    include: MEETING_LIST_INCLUDE,
  });

  const { reminder24hRunId, reminder1hRunId } = await scheduleMeetingReminders(meeting);
  if (reminder24hRunId || reminder1hRunId) {
    await prisma.meeting.update({ where: { id: meeting.id }, data: { reminder24hRunId, reminder1hRunId } });
  }

  // Every initial participant gets an invitation — including the
  // organizer, per this spec's explicit "including when the meeting is
  // created."
  await enqueueMeetingNotification("INVITATION", meeting.id, meeting.notificationRevision, participantMemberIds, {
    title: meeting.title,
    description: meeting.description,
    scheduledAt: meeting.scheduledAt.toISOString(),
    endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
    location: meeting.location,
    meetingUrl: meeting.meetingUrl,
    organizerName: meeting.organizer.displayName,
  });

  return NextResponse.json({ meeting: serializeMeetingListItem(meeting) }, { status: 201 });
}
