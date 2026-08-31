import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/current-member";
import { enqueueGoogleCalendarSync } from "@/lib/sync-calendar";
import { serializeCalendarEvent, type UnifiedCalendarItem } from "@/lib/calendar";

// GET /api/calendar/events — ?from=&to= range filters (ISO dates).
// Returns CalendarEvent rows merged with task due dates into one unified
// shape. Meeting dates join this merge once 16-meeting-scheduling.md
// exists — TODO, revisit this route then.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

  const [events, tasksInRange] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: range ? { startAt: range } : undefined,
      include: { createdBy: { select: { displayName: true } } },
      orderBy: { startAt: "asc" },
    }),
    // A task's *range* (startDate -> dueDate) overlaps the window, not
    // just its due date — a task that started earlier and is still due
    // later should still show.
    prisma.task.findMany({
      where: range ? { startDate: { lte: range.lte }, dueDate: { gte: range.gte } } : undefined,
      select: { id: true, title: true, startDate: true, dueDate: true },
    }),
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
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return NextResponse.json({
    items,
    events: events.map(serializeCalendarEvent),
  });
}

// POST /api/calendar/events — any authenticated member creates a standalone event.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await getCurrentMember();
  const body = await request.json();
  const { title, description, startAt, endAt } = body;

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof startAt !== "string" || Number.isNaN(Date.parse(startAt))) {
    return NextResponse.json({ error: "startAt must be a valid date" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title: title.trim(),
      description: typeof description === "string" && description.trim() !== "" ? description.trim() : null,
      startAt: new Date(startAt),
      endAt: typeof endAt === "string" && endAt !== "" ? new Date(endAt) : null,
      createdById: creator.id,
    },
    include: { createdBy: { select: { displayName: true } } },
  });

  await enqueueGoogleCalendarSync("CALENDAR_EVENT", event.id);

  return NextResponse.json({ event: serializeCalendarEvent(event) }, { status: 201 });
}
