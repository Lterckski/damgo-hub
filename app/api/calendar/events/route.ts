import { taskVisibilityWhere } from "@/lib/hub/context";
import { hubApiGuard } from "@/lib/hub/context";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember, isCurrentMemberAdmin } from "@/lib/current-member";
import {
  cancelCalendarReminder,
  scheduleCalendarReminder,
} from "@/lib/calendar-reminders";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import {
  serializeCalendarEvent,
  type UnifiedCalendarItem,
} from "@/lib/calendar";
import { getVisibleMeetingCalendarItems } from "@/lib/meetings";

// GET /api/calendar/events — ?from=&to= range filters (ISO dates).
// Returns CalendarEvent rows merged with task due dates and meetings
// visible to the caller into one unified shape — see
// 16-meeting-scheduling.md's Calendar Integration section.
export async function GET(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [member, isAdmin] = await Promise.all([
    getCurrentMember(),
    isCurrentMemberAdmin(),
  ]);

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range =
    from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

  const [events, tasksInRange, meetingItems] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: range ? { startAt: range } : undefined,
      include: { createdBy: { select: { displayName: true } } },
      orderBy: { startAt: "asc" },
    }),
    // A task's *range* (startDate -> dueDate) overlaps the window, not
    // just its due date — a task that started earlier and is still due
    // later should still show.
    prisma.task.findMany({
      where: {
        AND: [
          await taskVisibilityWhere(),
          range
            ? { startDate: { lte: range.lte }, dueDate: { gte: range.gte } }
            : {},
        ],
      },
      select: { id: true, title: true, startDate: true, dueDate: true },
    }),
    getVisibleMeetingCalendarItems(member.id, isAdmin, range),
  ]);

  const items: UnifiedCalendarItem[] = [
    ...events.map((event) => ({
      id: event.id,
      title: event.title,
      type: "event" as const,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt ? event.endAt.toISOString() : null,
      creatorId: event.createdById,
    })),
    ...tasksInRange.map((task) => ({
      id: task.id,
      title: task.title,
      type: "task" as const,
      startAt: task.startDate.toISOString(),
      endAt: task.dueDate.toISOString(),
      creatorId: null,
    })),
    ...meetingItems,
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return NextResponse.json({
    items,
    events: events.map(serializeCalendarEvent),
  });
}

// POST /api/calendar/events — org:admin (Leader/Assistant Leader) only.
// Regular members can't create standalone events — see the user's explicit
// call in progress-tracker.md.
export async function POST(request: Request) {
  const workspaceDenied = await hubApiGuard();
  if (workspaceDenied) return workspaceDenied;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isCurrentMemberAdmin())) {
    return NextResponse.json(
      { error: "Only Admins can create calendar events" },
      { status: 403 },
    );
  }

  const creator = await getCurrentMember();
  const body = await request.json();
  const { title, description, startAt, endAt } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof startAt !== "string" || Number.isNaN(Date.parse(startAt))) {
    return NextResponse.json(
      { error: "startAt must be a valid date" },
      { status: 400 },
    );
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title: title.trim(),
      description:
        typeof description === "string" && description.trim() !== ""
          ? description.trim()
          : null,
      startAt: new Date(startAt),
      endAt: typeof endAt === "string" && endAt !== "" ? new Date(endAt) : null,
      createdById: creator.id,
    },
    include: { createdBy: { select: { displayName: true } } },
  });

  await enqueueGoogleCalendarSync("CALENDAR_EVENT", event.id);

  const reminderRunId = await scheduleCalendarReminder(event);
  if (reminderRunId) {
    try {
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { reminderRunId },
      });
    } catch (error) {
      // Persisting the id failed after the run was already created —
      // cancel it rather than leave an orphaned scheduled run that will
      // fire later and silently no-op (its id will never match what's in
      // the database).
      console.error(
        "Failed to persist reminderRunId, cancelling orphaned reminder run",
        error,
      );
      await cancelCalendarReminder(reminderRunId);
    }
  }

  return NextResponse.json(
    { event: serializeCalendarEvent(event) },
    { status: 201 },
  );
}
