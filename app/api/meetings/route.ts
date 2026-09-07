import { entityVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import { normalizeAgendaItemDrafts } from "@/lib/meeting-format";
import {
  createMeetingNotificationOutbox,
  enqueueMeetingNotificationOutbox,
  scheduleMeetingReminders,
} from "@/lib/meeting-notifications";
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
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

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
      ...{
        ...meetingVisibilityWhere(member.id, isAdmin),
        ...(upcomingOnly ? { scheduledAt: { gte: new Date() } } : {}),
      },
      AND: [await entityVisibilityWhere("meeting")],
    },
    include: MEETING_LIST_INCLUDE,
    orderBy: { scheduledAt: upcomingOnly ? "asc" : "desc" },
  });

  return NextResponse.json({
    meetings: meetings.map(serializeMeetingListItem),
  });
}

// POST /api/meetings — Admin only. Scheduling is an `org:admin` action
// (Scheduling Permission in 16-meeting-scheduling.md); the scheduling
// admin becomes the organizer and is automatically a participant.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [organizer, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);
  // Enforced here, on the parsed request, before any write, outbox row or
  // reminder is scheduled — hiding the dialog is presentation only.
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only an admin can schedule a meeting" },
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
    agendaItems,
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

  let endsAtDate: Date | null = null;
  if (typeof endsAt === "string" && endsAt !== "") {
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

  // Normalize participants: dedupe, always include the organizer, and
  // drop any id that isn't a real member rather than letting a bad id
  // crash the create with a raw FK error — same normalization PATCH's
  // spec text calls for, applied here too since the organizer is
  // "automatically included as a participant" from the moment of
  // creation, per this spec's Permissions section.
  const requestedIds: string[] = Array.isArray(participantIds)
    ? participantIds.filter((id): id is string => typeof id === "string")
    : [];
  const wholeOrg = body.visibilityScope === "org";
  if (wholeOrg) {
    const { listOrgRoles } = await import("@/lib/organization-roles");
    const roles = await listOrgRoles();
    const orgMembers = await prisma.member.findMany({
      where: { clerkUserId: { in: [...roles.keys()] } },
      select: { id: true },
    });
    requestedIds.push(...orgMembers.map((m) => m.id));
  }
  const uniqueRequestedIds = [...new Set([...requestedIds, organizer.id])];
  const realMembers = await prisma.member.findMany({
    where: { id: { in: uniqueRequestedIds } },
    select: { id: true, displayName: true },
  });
  const participantMemberIds = realMembers.map((m) => m.id);

  // Only the Leader/Assistant Leader can add final agenda items directly
  // — enforced here, not just by hiding the "Add an agenda" button
  // client-side (see architecture-context.md invariant 3). A non-admin's
  // submitted agendaItems are silently dropped rather than erroring the
  // whole request, same leniency as an unknown participant id above.
  const agendaItemTexts =
    isAdmin && Array.isArray(agendaItems)
      ? normalizeAgendaItemDrafts(
          agendaItems.filter(
            (item): item is string => typeof item === "string",
          ),
        )
      : [];

  let creationResult: Awaited<ReturnType<typeof createMeeting>>;
  try {
    creationResult = await createMeeting({
      visibilityScope: wholeOrg ? "org" : "user",
      title: title.trim(),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description.trim()
          : null,
      scheduledAt: scheduledAtDate,
      endsAt: endsAtDate,
      location:
        typeof location === "string" && location.trim() !== ""
          ? location.trim()
          : null,
      meetingUrl: meetingUrlValue,
      organizerId: organizer.id,
      organizerName: organizer.displayName,
      participantMemberIds,
      agendaItemTexts,
    });
  } catch (error) {
    console.error("Failed to schedule meeting", {
      organizerId: organizer.id,
      error,
    });
    return NextResponse.json(
      { error: "The meeting could not be scheduled. Please try again." },
      { status: 500 },
    );
  }

  const { meeting, invitationOutboxId } = creationResult;

  // External side effects happen after the durable meeting + outbox commit.
  // Their failure is logged but never turns a successful create into a 500.
  try {
    const { reminder24hRunId, reminder1hRunId } =
      await scheduleMeetingReminders(meeting);
    if (reminder24hRunId || reminder1hRunId) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { reminder24hRunId, reminder1hRunId },
      });
    }
  } catch (error) {
    console.error("Failed to reconcile reminder runs after meeting creation", {
      meetingId: meeting.id,
      error,
    });
  }
  if (invitationOutboxId)
    await enqueueMeetingNotificationOutbox(invitationOutboxId);

  return NextResponse.json(
    { meeting: serializeMeetingListItem(meeting) },
    { status: 201 },
  );
}

interface CreateMeetingInput {
  visibilityScope: string;
  title: string;
  description: string | null;
  scheduledAt: Date;
  endsAt: Date | null;
  location: string | null;
  meetingUrl: string | null;
  organizerId: string;
  organizerName: string;
  participantMemberIds: string[];
  agendaItemTexts: string[];
}

function createMeeting(input: CreateMeetingInput) {
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        visibilityScope: input.visibilityScope,
        title: input.title,
        description: input.description,
        scheduledAt: input.scheduledAt,
        endsAt: input.endsAt,
        location: input.location,
        meetingUrl: input.meetingUrl,
        organizerId: input.organizerId,
        participants: {
          create: input.participantMemberIds.map((memberId) => ({ memberId })),
        },
      },
      include: MEETING_LIST_INCLUDE,
    });

    if (input.agendaItemTexts.length > 0) {
      await tx.agendaItem.createMany({
        data: input.agendaItemTexts.map((text, position) => ({
          meetingId: meeting.id,
          text,
          position,
          addedById: input.organizerId,
        })),
      });
    }

    const invitationOutboxId = await createMeetingNotificationOutbox(
      tx,
      "INVITATION",
      meeting.id,
      meeting.notificationRevision,
      input.participantMemberIds,
      {
        title: meeting.title,
        description: meeting.description,
        scheduledAt: meeting.scheduledAt.toISOString(),
        endsAt: meeting.endsAt ? meeting.endsAt.toISOString() : null,
        location: meeting.location,
        meetingUrl: meeting.meetingUrl,
        organizerName: input.organizerName,
        agendaItems: input.agendaItemTexts,
      },
    );

    return { meeting, invitationOutboxId };
  });
}
